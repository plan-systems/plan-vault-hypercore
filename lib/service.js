'use strict';

const messages = require('./vault_pb');
const { newFeed } = require('./feed');


function feedService(call) {

  let feeds = {};
  feeds._state = {};

  feeds.open = opener(call, feeds);
  feeds.close = closer(feeds);
  feeds.append = appender(feeds);
  feeds.unsupported = unsupported(call);

  call.on('data', function (msg) {
    switch (msg.getMsgop()) {
    case messages.FeedMsgOp.OPENFEED:
      feeds.open(msg, responder(call, msg));
      break;
    case messages.FeedMsgOp.CLOSEFEED:
      feeds.close(msg, responder(call, msg));
      break;
    case messages.FeedMsgOp.APPENDENTRY:
      feeds.append(msg, responder(call, msg));
      break;
    default:
      feeds.unsupported(msg);
      break;
    }
  });

  call.on('end', function () {
    // TODO: close all feeds
    console.log('<- end');
  });
}

// opener: returns a function that opens a feed or resets it with a
// read sream configuration from the message's openReq. calls the
// callback with (err)
function opener(call, feeds) {
  return function(msg, cb) {
    var feedID = msg.getReqid();
    let feed = feeds._state[feedID];
    if (!feed) {
      console.log('<- opening feed:' + feedID);
      feeds._state[feedID] = newFeed(call, msg, cb);
    } else {
      console.log('<- resetting feed:' + feedID);
      feed.reset(msg, cb);
      // feeds._state[feedID] = feed; TODO: I don't think we need to do this?
    }
  };
}

// closer: returns a function that closes the feed indicated by the
// message's feed ID. calls the callback with (err)
function closer(feeds) {
  return function(msg, cb) {
    let feedID = msg.getFeedid();
    console.log('<- close feed:' + feedID); // DEBUG
    let feed = feeds._state[feedID];
    if (!feed) {
      cb('feed is not open');
    } else {
      feed.close((e) => {
        delete feeds._state[feedID];
        cb(e);
      });
    }
  };
}

// appender: returns a function that appends an entry to the feed
// indicated by the message's feed ID. calls the callback with (err)
function appender(feeds) {
  return function(msg, cb) {
    let feedID = msg.getFeedid();
    console.log('<- append to feed:' + feedID); // DEBUG
    let feed = feeds._state[feedID];
    if (!feed) {
      cb('feed is not open');
    } else {
      feed.append(msg, cb);
    }
  };
}

// responder: returns a function suitable as a (err) callback
// that sends a feedMsg back. Only used for control RPCs, not
// for sending new entries
function responder(call, msg) {
  return function(e) {

    let resp = new messages.FeedMsg();
    resp.setReqid(msg.getReqid());
    resp.setFeedid(msg.getFeedid());

    if (!e) {
      resp.setMsgop(messages.FeedMsgOp.REQCOMPLETE);
      resp.setEntryid(0); // new data blocks don't use respond
    } else {
      console.log('error: ' + e);
      let err = new messages.ReqErr();
      err.setErrcode = messages.ErrCode.UNNAMEDERR;
      err.setMsg = e;
      resp.setMsgop(messages.FeedMsgOp.REQDISCARDED);
      resp.setMsgdata(err.serializeBinary());
    }
    console.log('writing response [code:' + resp.getMsgop() + ']'); // DEBUG
    if (call.writable) {
      call.write(resp);
    } else {
      console.log('feed was not writable!');
    }
  };
}

// can't rely on clients giving us valid ops
// TODO: also need to have better handling of invalid proto data
function unsupported(call) {
  return function(msg) {
    console.log('<- unsupported op'); // DEBUG
    let resp = new messages.FeedMsg();
    resp.setReqid(msg.getReqid());

    let err = new messages.ReqErr();
    err.setErrcode(messages.ErrCode.UNNAMEDERR);
    err.setMsg('unsupported operation');

    resp.setMsgop(messages.FeedMsgOp.REQDISCARDED);
    resp.setMsgdata(err.serializeBinary());

    call.write(resp);
  };
}

exports.feedService = feedService;
