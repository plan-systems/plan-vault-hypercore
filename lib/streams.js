'use strict';

const messages = require('./vault_pb');
const feeds = require('./feeds');

// TODO: provide configuration options for these hypercore parameters

// timeout for each data event (0 means no timeout)
const STREAM_TIMEOUT = 0;

// amount of messages to read in batch, increasing it (e.g. 100) can
// improve the performance reading
const STREAM_BATCH_SIZE = 1;


function newStream(msg, cb) {

  // TODO: having to serde this proto inside another proto's fields
  // seems janky... could be that optional fields are 0-bytes on the
  // wire, which makes adding a field zero-cost
  let raw =  msg.getMsgdata();
  let openReq = messages.OpenFeedReq.deserializeBinary(raw);
  let uri = openReq.getFeeduri();

  // TODO: VaultCtx is opaque to the client, so it's just for us to
  // use if we need to pass some kind of resume token back. Figure out
  // if we need it or not once we get p2p fully working.
  var ctx = openReq.getVaultctx();

  let streamID = msg.getReqid();
  if (streamID === 0) {
    cb('invalid stream ID');
    return;
  }

  var stream = {};
  stream.ID = streamID;
  stream.URI = uri;
  stream.index = 0;

  stream.append = appender(stream);
  stream.reset = resetter(stream);
  stream.close = closer(stream);

  feeds.open(uri, ctx, (feed, err) => {
    if (err) {
      cb(err);
      return;
    }
    stream._feed = feed;
    let genesis = openReq.getGenesisentry();
    if (genesis) {
      console.log('writing genesis entry');
      // we don't want to respond unless we get an error here,
      // because we still have more work to do
      feed.append(genesis.getMsgdata(), (e) => {
        if (e) { cb(e); }
      });
    }
    stream.reset(openReq, cb);
  });

  return stream;
}

function appender(stream) {
  return function(msg, cb) {
    if (!stream._feed || !stream._feed.isWritable()) {
      cb('feed is not writable');
    } else {
      let data = msg.getMsgdata();
      stream._feed.append(data, (e, seq) => {
        if (e) {
          cb(e);
        } else {
          let resp = new messages.FeedMsg();
          resp.setMsgop(messages.FeedMsgOp.REQCOMPLETE);
          resp.setFeedid(stream.ID);
          resp.setReqid(msg.getReqid());
          resp.setEntryid(seq);
          cb(null, resp);
        }
      });
    }
  };
}

function closer(stream) {
  return function(cb) {
    if (stream._stream) {
      stream._stream.destroy();
    }
    cb();
  };
}

// resetter returns a function that destroys the feed's existing
// read stream and starts a new one with the a configuration derived
// from the OpenReq
function resetter(stream) {
  return function(req, cb) {

    if (stream._stream) {
      stream._stream.destroy();
    }

    let mode = req.getStreammode();
    if (mode === messages.StreamMode.DONTSTREAM) {
      cb();
      return;
    }

    let idsOnly = req.getSendentryidsonly();

    let cfg = readStreamConfig(mode,
                               req.getSeekentryid(),
                               stream._feed.length(),
                               req.getMaxentriestosend());

    stream.index = cfg.start;
    console.log(stream._feed);
    stream._stream = stream._feed.createReadStream(cfg)
      .on('data', (data) => {
        console.log('got data block from stream');
        let resp = new messages.FeedMsg();
        resp.setReqid(stream.ID);
        resp.setFeedid(stream.ID);
        resp.setMsgop(messages.FeedMsgOp.RECVENTRY);
        resp.setEntryid(stream.index++);
        if (!idsOnly) {
          resp.setMsgdata(data);
        }
        cb(null, resp);
      });

    cb();
  };
}


// returns the configuration object for createReadStream, setting the
// position based on the mode and other fields
function readStreamConfig(mode, start, end, max) {

  let isLive = false;
  let isTail = false;

  switch (mode) {
  case messages.StreamMode.AFTERENTRY:
    start = start + 1;
    break;
  case messages.StreamMode.AFTERHEAD:
    isTail = true; // TODO: verify this overrides start
    break;
  default: // ATENTRY, DONTSTREAM, FROMGENESIS
    break;
  }

  if (max === 0) {
    isLive = true;
  } else {
    end = start + max;
  }

  // TODO: provide parameters for timeout and batchsize config
  // TODO: figure out what the heck snapshot is for
  return {
    start: start, // read from this index
    end: end, // read until this index
    snapshot: true, // if set to false it will update `end` to `feed.length` on every read
    tail: isTail, // sets `start` to `feed.length`
    live: isLive, // set to true to keep reading forever
    timeout: STREAM_TIMEOUT,
    wait: true, // wait for data to be downloaded
    batch: STREAM_BATCH_SIZE
  };

}

exports.newStream = newStream;
