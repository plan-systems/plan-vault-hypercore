'use strict';

const assert = require('assert').strict;
const async = require('async');

const messages = require('../lib/vault_pb');
const t = require('./helpers');

const ErrOpCodeForOpen = 'wrong opcode returned for OPENFEED';
const ErrOpCodeForAppend = 'wrong opcode returned for APPENDENTRY';
const ErrOpCodeForClose = 'wrong opcode returned for CLOSEFEED';
const ErrOpCodeForRead = 'wrong opcode returned for RECVENTRY';


// Exercise genesis block creation and re-opening a closed feed.
async function runTestGenesis(callback) {
  let client = t.newClient();
  let call = client.feedServicePipe();

  let feedID = 7;
  let feedUri = './data/_testGenesis';
  var reqID = 7;

  try {
    // 1. open new feed with genesis block
    var resp = await t.open(call, feedID, feedUri, reqID,
                            {mode: messages.StreamMode.DONTSTREAM},
                            'genesis');
    assert.strictEqual(resp.getMsgop(), messages.FeedMsgOp.REQCOMPLETE, ErrOpCodeForOpen);

    // 2. append another entry
    resp = await t.append(call, feedID, reqID++, 'test 1');
    assert.strictEqual(resp.getMsgop(), messages.FeedMsgOp.REQCOMPLETE, ErrOpCodeForAppend);

    // 3. close the feed
    resp = await t.close(call, feedID, reqID++);
    assert.strictEqual(resp.getMsgop(), messages.FeedMsgOp.REQCOMPLETE, ErrOpCodeForClose);

    // 4. reopen from the genesis block
    resp = await t.open(call, feedID, feedUri, reqID,
                        {mode: messages.StreamMode.FROMGENESIS});
    assert.strictEqual(resp.getMsgop(), messages.FeedMsgOp.REQCOMPLETE, ErrOpCodeForOpen);

    // 5. verify we get both blocks back
    resp = await t.read(call);
    assert.strictEqual(resp.getMsgop(), messages.FeedMsgOp.RECVENTRY, ErrOpCodeForRead);
    assert.strictEqual(resp.getEntryid(), 0, 'unexpected entry ID');
    assert.strictEqual(t.getMsgDataToString(resp),
                       'genesis',
                       'unexpected entry data');

    resp = await t.read(call);
    assert.strictEqual(resp.getMsgop(), messages.FeedMsgOp.RECVENTRY, ErrOpCodeForRead);
    assert.strictEqual(resp.getEntryid(), 1, 'unexpected entry ID');
    assert.strictEqual(t.getMsgDataToString(resp),
                       'test 1',
                       'unexpected entry data');

    t.cleanup(client, call, feedID);
    callback(null, 'PASS');
  } catch (ex) {
    t.cleanup(client, call, feedID);
    callback(ex, 'FAIL');
  }
}

// Exercise reopening a feed and seeking to a specific ID
async function runTestReopenWithSeek(callback) {
  let client = t.newClient();
  let call = client.feedServicePipe();

  let feedID = 8;
  let feedUri = './data/_testReopenWithSeek';
  var reqID = 8;

  try {
    // 1. open new feed
    var resp = await t.open(call, feedID, feedUri, reqID,
                            {mode: messages.StreamMode.DONTSTREAM});
    assert.strictEqual(resp.getMsgop(), messages.FeedMsgOp.REQCOMPLETE, ErrOpCodeForOpen);

    // 2. append 4 entries
    resp = await t.append(call, feedID, reqID++, 'test 1');
    assert.strictEqual(resp.getMsgop(), messages.FeedMsgOp.REQCOMPLETE, ErrOpCodeForAppend);
    resp = await t.append(call, feedID, reqID++, 'test 2');
    assert.strictEqual(resp.getMsgop(), messages.FeedMsgOp.REQCOMPLETE, ErrOpCodeForAppend);
    resp = await t.append(call, feedID, reqID++, 'test 3');
    assert.strictEqual(resp.getMsgop(), messages.FeedMsgOp.REQCOMPLETE, ErrOpCodeForAppend);
    resp = await t.append(call, feedID, reqID++, 'test 4');
    assert.strictEqual(resp.getMsgop(), messages.FeedMsgOp.REQCOMPLETE, ErrOpCodeForAppend);

    // 3. reopen without closing, from the 3rd block
    resp = await t.open(call, feedID, feedUri, reqID,
                        {start: 2, mode: messages.StreamMode.ATENTRY});
    assert.strictEqual(resp.getMsgop(), messages.FeedMsgOp.REQCOMPLETE, ErrOpCodeForOpen);

    // 4. verify we get block 3 back
    resp = await t.read(call);
    assert.strictEqual(resp.getMsgop(), messages.FeedMsgOp.RECVENTRY, ErrOpCodeForRead);
    assert.strictEqual(resp.getEntryid(), 2, 'unexpected entry ID');
    assert.strictEqual(t.getMsgDataToString(resp),
                       'test 3',
                       'unexpected entry data');

    // TODO: this doesn't currently work: we're getting back the
    // next block, instead of the RPC response
    //
    // 5. reopen without closing, from the block after the 1st block
    // resp = await t.open(call, feedID, feedUri, reqID++,
    //                     {start: 0, mode: messages.StreamMode.AFTERENTRY});
    // assert.strictEqual(resp.getMsgop(), messages.FeedMsgOp.REQCOMPLETE, ErrOpCodeForOpen);
    // resp = await t.read(call);
    // assert.strictEqual(resp.getMsgop(), messages.FeedMsgOp.RECVENTRY, ErrOpCodeForRead);
    // assert.strictEqual(resp.getEntryid(), 1, 'unexpected entry ID');
    // assert.strictEqual(t.getMsgDataToString(resp),
    //                    'test 2',
    //                    'unexpected entry data');

    t.cleanup(client, call, feedID);
    callback(null, 'PASS');
  } catch (ex) {
    t.cleanup(client, call, feedID);
    callback(ex, 'FAIL');
  }
}

// 1. open feed; open same feed in 2nd client
// 2. write 2 entries in 1st client, verify they show up in 2nd client
async function runTestFeedTailing(callback) {
  let client1 = t.newClient();
  let call1 = client1.feedServicePipe();

  let client2 = t.newClient();
  let call2 = client2.feedServicePipe();

  let feedID = 9;
  let feedUri = './data/_testFeedTailing';

  var reqID = 9;

  try {
    // 1. open new feed
    var resp = await t.open(call1, feedID, feedUri, reqID,
                            {mode: messages.StreamMode.DONTSTREAM});
    assert.strictEqual(resp.getMsgop(), messages.FeedMsgOp.REQCOMPLETE, ErrOpCodeForOpen);

    // 2. append 2 entries
    resp = await t.append(call1, feedID, reqID++, 'test 1');
    assert.strictEqual(resp.getMsgop(), messages.FeedMsgOp.REQCOMPLETE, ErrOpCodeForAppend);
    resp = await t.append(call1, feedID, reqID++, 'test 2');
    assert.strictEqual(resp.getMsgop(), messages.FeedMsgOp.REQCOMPLETE, ErrOpCodeForAppend);

    // 3. open from another client
    resp = await t.open(call2, feedID, feedUri, reqID,
                        {mode: messages.StreamMode.FROMGENESIS});
    assert.strictEqual(resp.getMsgop(), messages.FeedMsgOp.REQCOMPLETE, ErrOpCodeForOpen);

    // 4. verify we get the data in client2
    resp = await t.read(call2);
    assert.strictEqual(resp.getMsgop(), messages.FeedMsgOp.RECVENTRY, ErrOpCodeForRead);
    assert.strictEqual(resp.getEntryid(), 0, 'unexpected entry ID');
    assert.strictEqual(t.getMsgDataToString(resp),
                       'test 1',
                       'unexpected entry data');
    resp = await t.read(call2);
    assert.strictEqual(resp.getMsgop(), messages.FeedMsgOp.RECVENTRY, ErrOpCodeForRead);
    assert.strictEqual(resp.getEntryid(), 1, 'unexpected entry ID');
    assert.strictEqual(t.getMsgDataToString(resp),
                       'test 2',
                       'unexpected entry data');

    t.cleanup(client1, call1, feedID);
    t.cleanup(client2, call2, feedID);
    callback(null, 'PASS');
  } catch (ex) {
    t.cleanup(client1, call1, feedID);
    t.cleanup(client2, call2, feedID);
    callback(null, 'FAIL');
  }
}


async.series([
  runTestGenesis,
  runTestReopenWithSeek,
  runTestFeedTailing,
], function (err, results) {
  if (err !== null) {
    console.log('error: %s\nexpected: %s got %s\n%s',
                err.message, err.expected, err.actual, err.stack);
    process.exit(1);
  }
  console.log('results: %s', results);
  process.exit(0);
});
