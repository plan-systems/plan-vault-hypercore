'use strict';

const async = require('async');
const crypto = require('crypto');
const path = require('path')

const hypercore = require('hypercore');

let dataDir = './data';

var feeds = (function() {

  let _state = {}; // map of uri -> hypercore feeds
  let pub = {};

  // idempotently open a hypercore feed. callback receives (feed, err)
  // and will be called if there's an error or once the feed's
  // ready event has fired
  pub.open = function(uri, ctx, cb) {
    let feed = _state[uri];
    if (!feed) {
      console.log('opening feed:' + uri);
      _state[uri] = newFeed(uri, ctx, cb);
    } else {
      console.log('feed already open: ' + uri);
      // TODO: ensure two connections can't open a feed concurrently,
      // or at least that we always get a sensible error
      cb(feed);
    }
  };

  pub.shutdown = function() {
    async.eachOf(_state,
               function(feed, err, cb) { feed.close(cb); },
               function(err) { if (err) { console.log(err); }});
  };

  return pub;
}());


function newFeed(uri, ctx, cb) {

  // TODO: wrapping the hypercore feed here just gives us a bit of API
  // stability around errors, but maybe that's excessive?
  var feed = {};

  let dir = path.join(dataDir,
                      crypto.createHash('sha256')
                      .update(uri)
                      .digest('hex'));

  feed._hfeed = hypercore(dir, null, { valueEncoding: 'binary' });

  feed.close = feedCloser(feed);
  feed.append = feedAppender(feed);
  feed.isWritable = function() { return feed._hfeed.writable; };
  feed.length = function() { return feed._hfeed.length; };
  feed.createReadStream = function(cfg) { return feed._hfeed.createReadStream(cfg); };

  feed._hfeed.on('ready', () => {
    console.log('feed is ready: ' + uri);
    cb(feed);
  });
  return feed;
}


function feedAppender(feed) {
  return function(data, cb) {
    if (!feed._hfeed.writable) {
      cb('feed is not writable');
    } else {
      feed._hfeed.append(data, cb);
    }
  };
}

// feedCloser returns a function that closes the hypercore feed,
// firing a callback with (err) once the feed is fully closed.
function feedCloser(feed) {
  return function(cb) {

    // TODO: need to confirm how this handles the closing of streams
    feed._hfeed.close(cb);
  };
}

exports.open = feeds.open;
exports.shutdown = feeds.shutdown;
