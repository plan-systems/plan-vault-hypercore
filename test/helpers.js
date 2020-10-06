'use strict';

const Buffer = require('buffer').Buffer;
const assert = require('assert').strict;
const grpc = require('grpc');
const process = require('process');

const messages = require('../lib/vault_pb');
const services = require('../lib/vault_grpc_pb');


// newClient handles the gRPC responses coming back and pushes them
// onto an array for the tests to inspect
function newClient() {
  let client = new services.VaultGrpcClient(
    'localhost:'+messages.Const.DEFAULTGRPCSERVICEPORT,
    grpc.credentials.createInsecure());
  return client;
}

async function append(call, feedID, reqID, data) {
  let msg = new messages.FeedMsg();
  msg.setFeedid(feedID);
  msg.setMsgop(messages.FeedMsgOp.APPENDENTRY);
  msg.setReqid(reqID);
  setMsgDataFromString(msg, data);
  return await send(call, msg);
}

// cfg = { start: int, mode: StreamMode, max: int, idsOnly: bool }
async function open(call, feedID, feedUri, reqID, cfg, genesisData) {

  let openFeedReq = new messages.OpenFeedReq();
  openFeedReq.setFeeduri(feedUri);
  openFeedReq.setStreammode(cfg.mode);
  openFeedReq.setSeekentryid(cfg.start);
  openFeedReq.setMaxentriestosend(cfg.max);
  openFeedReq.setSendentryidsonly(cfg.idsOnly);

  if (genesisData) {
    let genesis = new messages.FeedMsg();
    genesis.setFeedid(feedID);
    setMsgDataFromString(genesis, 'genesis');
    openFeedReq.setGenesisentry(genesis);
  }

  let msg  = new messages.FeedMsg();
  msg.setFeedid(feedID);
  msg.setMsgop(messages.FeedMsgOp.OPENFEED);
  msg.setReqid(reqID);

  // TODO: this feels a little goofy but is needed to support both
  // the open req and a genesis block
  msg.setMsgdata(openFeedReq.serializeBinary());

  return await send(call, msg);
}

async function close(call, feedID, reqID) {
  let closeMsg = new messages.FeedMsg();
  closeMsg.setFeedid(feedID);
  closeMsg.setMsgop(messages.FeedMsgOp.CANCELREQ);
  closeMsg.setReqid(reqID);
  return await send(call, closeMsg);
}

async function cleanup(client, call, feedID) {
  await close(call, feedID, 9999);
  call.end();
  client.close();
}

// send writes the requested message and returns a promise we can await
function send(call, msg) {
  return _poll(call, 'data', msg);
}

// read lets us wait for the next data block
function read(call) {
  return _poll(call, 'data');
}

// _poll lets us await either the requested event or an error
function _poll(call, event, msg) {
  let timeout = setTimeout(function() { assert.fail('test timed-out'); }, 2000);
  let promise = new Promise((resolve, reject) => {
    const success = (val) => {
      call.off('error', fail);
      clearTimeout(timeout);
      resolve(val);
    };
    const fail = (err) => {
      call.off(event, success);
      clearTimeout(timeout);
      reject(err);
    };
    call.once(event, success);
    call.once('error', fail);
  });
  if (msg) {
    call.write(msg);
  }
  return promise;
}

// test helper
function getMsgDataToString(msg) {
  return Buffer.from(msg.getMsgdata()).toString('utf-8');
}

// test helper
function setMsgDataFromString(msg, s) {
  return msg.setMsgdata(Buffer.from(s, 'utf8'));
}

exports.open = open;
exports.append = append;
exports.close = close;
exports.cleanup = cleanup;
exports.newClient = newClient;
exports.read = read;
exports.getMsgDataToString = getMsgDataToString;
