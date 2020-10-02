'use strict';

const grpc = require('grpc');

const services = require('./lib/vault_grpc_pb');
const { feedService } = require('./lib/service');

function getServer() {
  var server = new grpc.Server();
  server.addService(services.VaultGrpcService, {
    feedService: feedService,
  });
  return server;
}

// TODO: make this configurable
var bindOnAddr = '0.0.0.0:50051';

function main() {
  var server = getServer();
  console.log('listening for pnode connections on', bindOnAddr);
  server.bind(bindOnAddr, grpc.ServerCredentials.createInsecure());
  server.start();
}

main();
