'use strict';

const hypercore = require('hypercore');

const messages = require('./vault_pb');

// TODO: provide configuration options for these hypercore parameters

// timeout for each data event (0 means no timeout)
const STREAM_TIMEOUT = 0;

// amount of messages to read in batch, increasing it (e.g. 100) can
// improve the performance reading
const STREAM_BATCH_SIZE = 1;


function newFeed(msg, clientStream, respondCb) {

  // TODO: having to serde this proto inside another proto's fields
  // seems janky... could be that optional fields are 0-bytes on the
  // wire, which makes adding a field zero-cost
  let raw =  msg.getMsgdata();
  let openReq = messages.OpenFeedReq.deserializeBinary(raw);

  // TODO: what are we supposed to do with this?
  // var ctx = openReq.getVaultctx();

  let mode = openReq.getStreammode();

  // TODO: using the feed URI as the feed path is a placeholder; we
  // need to map this to both the right spot in the filesystem and tie
  // it into hypercore p2p
  let uri = openReq.getFeeduri();

  let idsOnly = openReq.getSendentryidsonly();


  let feed = hypercore(uri, null, { valueEncoding: 'binary' });

  var pub = {};

  // callback called with (err) after we're fully closed
  pub.close = function(respondCb) {
    console.log('closing stream');
    feed.close(respondCb);
  };

  // callback called with (err, seq)
  pub.append = function(msg, respondCb) {
    if (!feed.writable) {
      console.log('feed isn\'t writable');
      respondCb('feed is closed for writing');
    } else {
      console.log('writing!');
      let data = msg.getMsgdata();
      feed.append(data, respondCb);
    }
  };

  // TODO: currently the design for this isn't right, as we should be
  // keeping the feed open and resetting the read stream, rather than
  // closing the feed.
  //
  feed.on('ready', function() {
    console.log('feed is ready');

    let genesis = openReq.getGenesisentry();
    if (genesis) {
      console.log('writing genesis entry');
      // we don't want to respond unless we get an error here, because
      // we still have more work to do
      feed.append(genesis.getMsgdata(), (e) => {
        if (e) { respondCb(e); }
      });
    }

    if (mode === messages.StreamMode.DONTSTREAM) {
      console.log('no read stream');
      respondCb();
      return;
    }

    // we need to wait until we get the on ready to create the config
    // b/c we need to check the feed length here
    let cfg = readStreamConfig(feed, mode,
                               openReq.getSeekentryid(),
                               openReq.getMaxentriestosend());

    console.log('opening read stream' + cfg); // DEBUG

    feed.createReadStream(cfg)
      .on('data', (data) => {
        // TODO: make sure we don't return our own writes!
        let resp = new messages.FeedMsg();
        resp.setReqid(msg.getReqid());
        resp.setFeedid(msg.getFeedid());
        resp.setMsgop(messages.FeedMsgOp.RECVENTRY);

        // TODO: this only "works" in that the start is being bumped
        // with each read but this probably falls over under
        // concurrency. How do we get the current index from this event?
        resp.setEntryid(cfg.start);

        if (!idsOnly) {
          resp.setMsgdata(data);
        }
        clientStream.write(resp);
        cfg.start++;
      })
      .on('end', () => {
        if (!cfg.live) {
          pub.close(respondCb);
        }});

    respondCb();
  });

  return pub;
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
