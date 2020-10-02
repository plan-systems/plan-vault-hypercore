// GENERATED CODE -- DO NOT EDIT!

'use strict';
var grpc = require('grpc');
var vault_pb = require('./vault_pb.js');

function serialize_vault_FeedMsg(arg) {
  if (!(arg instanceof vault_pb.FeedMsg)) {
    throw new Error('Expected argument of type vault.FeedMsg');
  }
  return Buffer.from(arg.serializeBinary());
}

function deserialize_vault_FeedMsg(buffer_arg) {
  return vault_pb.FeedMsg.deserializeBinary(new Uint8Array(buffer_arg));
}


// VaultGrpc is append-only feed server model.
var VaultGrpcService = exports.VaultGrpcService = {
  // FeedService offers a client service to a vault's feed repo.
// The client submits requests to be executed, and the server streams feed entries and completion status.
// The return stream remains open as long as the client stream remains open.
feedService: {
    path: '/vault.VaultGrpc/FeedService',
    requestStream: true,
    responseStream: true,
    requestType: vault_pb.FeedMsg,
    responseType: vault_pb.FeedMsg,
    requestSerialize: serialize_vault_FeedMsg,
    requestDeserialize: deserialize_vault_FeedMsg,
    responseSerialize: serialize_vault_FeedMsg,
    responseDeserialize: deserialize_vault_FeedMsg,
  },
};

exports.VaultGrpcClient = grpc.makeGenericClientConstructor(VaultGrpcService);
