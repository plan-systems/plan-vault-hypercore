'use strict';

const messages = require('./vault_pb');
const { newFeed } = require('./feed');


function feedService(call) {
  call.on('data', function (msg) {
    switch (msg.getMsgop()) {
    case messages.FeedMsgOp.OPENFEED:
      feeds.open(msg, call, respond(call, msg));
      break;
    case messages.FeedMsgOp.CLOSEFEED:
      feeds.close(msg, respond(call, msg));
      break;
    case messages.FeedMsgOp.APPENDENTRY:
      feeds.append(msg, respond(call, msg));
      break;
    default:
      handleUnsupported(call, msg);
      break;
    }
  });

  call.on('end', function () {
    console.log('closing service!');
    call.end();
  });
}


// state management of feeds with functions that proxy ops to the
// correct feed for the message.
var feeds = (function() {

  let state = {};
  let pub = {};

  // handle OpenFeed: a connection can have several open feeds at a
  // time; if a client calls this again, reset the the feed with the
  // new index, etc.
  pub.open = function (msg, call, respondCb) {
    console.log('<- open feed'); // DEBUG
    var feedID =  msg.getFeedid();
    if (feedID === 0) {
      // TODO: how do we associated a feed ID with a specific
      // consumer?  do we need to worry about this in the vault or do
      // we only have 1 pnode per vault?
      feedID = state.length + 1;
    }
    var feed = state[feedID];
    if (feed) {
      // we just close and reset the feed with the new OpenFeedReq
      feed.close((e) => {
        if (e) {
          respondCb(e);
        } else {
          console.log('reopening feed');
          state[feedID] = newFeed(msg, call, respondCb);
        }
      });
      return;
    }
    state[feedID] = newFeed(msg, call, respondCb);
  };

  // handle CloseFeed
  pub.close = function(msg, respondCb) {
    console.log('<- close feed'); // DEBUG
    var feedID = msg.getFeedid();
    var feed = state[feedID];
    if (!feed) {
      respondCb('no such feed');
    } else {
      feed.close(msg, respondCb);
      state[feedID] = null;
      respondCb();
    }
  };

  // handle AppendEntry
  pub.append = function(msg, respondCb) {
    console.log('<- append entry'); // DEBUG
    var feedID = msg.getFeedid();
    var feed = state[feedID];
    if (feed === null) {
      respondCb('no such feed');
    } else {
      feed.append(msg, respondCb);
    }
  };

  return pub;
}());


// respond: returns a function suitable as a (err) callback
// that sends a feedMsg back. Only used for control RPCs, not
// for sending new entries
function respond(call, msg) {
  return function(e) {

    let resp = new messages.FeedMsg();
    resp.setReqid(msg.getReqid());
    resp.setFeedid(msg.getFeedid());

    if (!e) {
      resp.setMsgop(messages.FeedMsgOp.REQCOMPLETE);
      resp.setEntryid(0); // new data blocks don't use respond
    } else {
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
function handleUnsupported(call, msg) {
  console.log('<- unsupported op'); // DEBUG
  let resp = new messages.FeedMsg();
  resp.setReqid(msg.getReqid());
  resp.setFeedid(msg.getFeedid());

  let err = new messages.ReqErr();
  err.setErrcode = messages.ErrCode.UNNAMEDERR;
  err.setMsg = 'unsupported operation';

  resp.setMsgop(messages.FeedMsgOp.REQDISCARDED);
  resp.setMsgdata(err.serializeBinary());

  call.write(resp);
}


exports.feedService = feedService;
