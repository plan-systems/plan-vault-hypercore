'use strict';

const hypercore = require('hypercore');

const messages = require('./vault_pb');

// TODO: provide configuration options for these hypercore parameters

// timeout for each data event (0 means no timeout)
const STREAM_TIMEOUT = 0;

// amount of messages to read in batch, increasing it (e.g. 100) can
// improve the performance reading
const STREAM_BATCH_SIZE = 1;


function newFeed(call, msg, cb) {

  // TODO: having to serde this proto inside another proto's fields
  // seems janky... could be that optional fields are 0-bytes on the
  // wire, which makes adding a field zero-cost
  let raw =  msg.getMsgdata();
  let openReq = messages.OpenFeedReq.deserializeBinary(raw);

  // TODO: VaultCtx is opaque to the client, so it's just for us to
  // use if we need to pass some kind of resume token back. Figure out
  // if we need it or not once we get p2p fully working.
  // var ctx = openReq.getVaultctx();

  // TODO: using the feed URI as the feed path is a placeholder; we
  // need to map this to both the right spot in the filesystem and tie
  // it into hypercore p2p
  let uri = openReq.getFeeduri();

  var feed = {};
  feed.ID = msg.getReqid();
  if (feed.ID == 0) {
    cb('invalid feed ID');
    return
  }
  feed.hfeed = hypercore(uri, null, { valueEncoding: 'binary' });
  feed.close = feedCloser(feed);
  feed.reset = feedResetter(call, feed);
  feed.append = feedAppender(feed);

  // start the read stream
  feed.hfeed.on('ready', () => {
    let genesis = openReq.getGenesisentry();
    if (genesis) {
      console.log('writing genesis entry');
      // we don't want to respond unless we get an error here, because
      // we still have more work to do
      feed.append(genesis, (e) => {
        if (e) { cb(e); }
      });
    }

    // we need to wait until we get the on ready to create the config
    // b/c we need to check the feed length here
    feed.reset(openReq, cb);

  });
  return feed;
}

function feedAppender(feed) {
  return function(msg, cb) {
    if (!feed.hfeed.writable) {
      cb('feed is not writable');
    } else {
      let data = msg.getMsgdata();
      feed.hfeed.append(data, (e, seq) => {
        if (e) {
          cb(e);
        } else {
          cb(); // TODO: need to get seq ID out
        }
      });
    }
  };
}

// feedCloser returns a function that shuts down the stream and closes
// the hypercore feed, firing a callback with (err) once the hypercore
// feed is fully closed
function feedCloser(feed) {
  return function(cb) {
    if (feed.stream) {
      feed.stream.destroy();
    }
    feed.hfeed.close(cb);
  };
}

// feedResetter returns a function that destroys the feed's existing
// read stream and starts a new one with the a configuration derived
// from the OpenReq
function feedResetter(call, feed) {
  return function(openReq, cb) {

    if (feed.stream) {
      feed.stream.destroy();
    }

    let mode = openReq.getStreammode();
    if (mode === messages.StreamMode.DONTSTREAM) {
      cb();
      return;
    }

    let idsOnly = openReq.getSendentryidsonly();

    let cfg = readStreamConfig(feed.hfeed, mode,
                               openReq.getSeekentryid(),
                               openReq.getMaxentriestosend());

    feed.index = cfg.start;
    feed.stream = feed.hfeed.createReadStream(null)
      .on('data', (data) => {
        let resp = new messages.FeedMsg();
        resp.setReqid(feed.ID);
        resp.setFeedid(feed.ID);
        resp.setMsgop(messages.FeedMsgOp.RECVENTRY);
        resp.setEntryid(feed.index++);
        if (!idsOnly) {
          resp.setMsgdata(data);
        }
        call.write(resp);
      });

    cb();
  };
}

// returns the configuration object for createReadStream, setting the
// position based on the mode and other fields
function readStreamConfig(feed, mode, start, max) {

  let end = feed.length;
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
  // TODO: not sure what the heck snapshot is for
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

exports.newFeed = newFeed;
