'use strict';

const async = require('async');

const messages = require('./vault_pb');
const { newStream } = require('./streams');

// A vault can have at most one copy of a feed open, but can have many
// read streams on that feed. Read streams are isolated to a
// connection (call). The per-connection feed service maps feed IDs to
// feeds, and establishes the read stream on the underlying feed.

function feedService(call) {

  // the plan protocol sends a per-connection FeedID, but each
  // connection can have at most one active stream on a feed. So we
  // treat FeedID as a StreamID
  let svc = {};
  svc.streams = {};

  svc.open = opener(svc.streams);
  svc.close = closer(svc.streams);
  svc.append = appender(svc.streams);
  svc.unsupported = unsupported(call);

  call.on('data', function (msg) {
    try {
      switch (msg.getMsgop()) {
      case messages.FeedMsgOp.OPENFEED:
        svc.open(msg, responder(call, msg));
        break;
      case messages.FeedMsgOp.CANCELREQ:
        svc.close(msg, responder(call, msg));
        break;
      case messages.FeedMsgOp.APPENDENTRY:
        svc.append(msg, responder(call, msg));
        break;
      default:
        svc.unsupported(msg);
        break;
      }
    } catch (ex) {
      // TODO: we want to safely handle invalid protobuf assertions
      // so that a buggy client can't DoS us, but just crash if we
      // have another unhandled exception
      console.log(ex);
      process.exit(1);
    }
  });

  call.on('end', function () {
    console.log('<- end');
    async.eachOf(svc.streams,
               function(stream, err, cb) { stream.close(cb); },
               function(err) { if (err) { console.log(err); }});

  });
}

// opener: returns a function that opens a stream or resets it with a
// read stream configuration from the message's openReq. calls the
// callback with (err)
function opener(streams) {
  return function(msg, cb) {
    var streamID = msg.getReqid();
    let stream = streams[streamID];
    if (!stream) {
      console.log('<- opening stream:' + streamID);
      streams[streamID] = newStream(msg, cb);
    } else {
      console.log('<- resetting stream:' + streamID);
      stream.reset(msg, cb);
    }
  };
}

// closer: returns a function that closes the stream indicated by the
// message's feed ID. calls the callback with (err)
function closer(streams) {
  return function(msg, cb) {
    let streamID = msg.getFeedid();
    console.log('<- close stream:' + streamID); // DEBUG
    let stream = streams[streamID];
    if (!stream) {
      cb('stream is not open');
    } else {
      stream.close((e) => {
        // TODO: can we close the underlying feed if there are no more
        // streams for it?
        delete streams[streamID];
        cb(e);
      });
    }
  };
}

// appender: returns a function that appends an entry to the feed
// indicated by the message's feed ID. calls the callback with (err)
function appender(streams) {
  return function(msg, cb) {
    let streamID = msg.getFeedid();
    console.log('<- append to stream:' + streamID); // DEBUG
    let stream = streams[streamID];
    if (!stream) {
      cb('stream is not open');
    } else {
      stream.append(msg, cb);
    }
  };
}

// responder: returns a function suitable as a (err, msg) callback
// that sends a feedMsg back to the client. If msg is set, the caller
// is responsible for making sure it has the correct source reqID so
// that clients can pair the response with the source message
function responder(call, srcMsg) {

  return function(e, msg) {
    if (!msg) {
      msg = new messages.FeedMsg();
      if (e) {
        console.log('error: ' + e); // DEBUG
        msg.setReqid(srcMsg.getReqid());
        msg.setFeedid(srcMsg.getFeedid());
        let err = new messages.ReqErr();
        err.setCode(messages.ErrCode.UNNAMEDERR);
        err.setMsg(e);
        msg.setMsgop(messages.FeedMsgOp.REQDISCARDED);
        msg.setMsgdata(err.serializeBinary());
      } else {
        msg.setReqid(srcMsg.getReqid());
        msg.setFeedid(srcMsg.getFeedid());
        msg.setMsgop(messages.FeedMsgOp.REQCOMPLETE);
        msg.setEntryid(0);
      }
    }

    console.log('writing response [code:' + msg.getMsgop() + ']'); // DEBUG
    if (call.writable) {
      call.write(msg);
    } else {
      console.log('feed was not writable!');
    }
  };
}

// can't rely on clients giving us valid ops
// TODO: also need to have better handling of invalid proto data
function unsupported(call) {
  return function(msg) {
    console.log('<- unsupported op:' + msg.getMsgop()); // DEBUG
    let resp = new messages.FeedMsg();
    resp.setReqid(msg.getReqid());

    let err = new messages.ReqErr();
    err.setCode(messages.ErrCode.UNNAMEDERR);
    err.setMsg('unsupported operation');

    resp.setMsgop(messages.FeedMsgOp.REQDISCARDED);
    resp.setMsgdata(err.serializeBinary());

    call.write(resp);
  };
}

exports.feedService = feedService;
