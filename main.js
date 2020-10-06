'use strict';

const grpc = require('grpc');
const process = require('process');

const messages = require('./lib/vault_pb');
const services = require('./lib/vault_grpc_pb');

const { feedService } = require('./lib/service');
const { shutdown } = require('./lib/feeds');


// TODO: make this configurable
const bindOnAddr = '0.0.0.0:'+messages.Const.DEFAULTGRPCSERVICEPORT;
const shutdownTimeout = 5000;


function getServer() {
  var server = new grpc.Server();
  server.addService(services.VaultGrpcService, {
    feedServicePipe: feedService,
  });
  return server;
}


// shutdownHandler shuts down the gRPC server and then shuts down
// feeds. if the timeout expires, force kill the gRPC server.
function shutdownHandler(server) {
  return function() {
    let timeout = setTimeout(function() {
      server.forceShutdown(() => { shutdown(); });
    }, shutdownTimeout);
    server.tryShutdown(() => {
      clearTimeout(timeout);
      shutdown();
    });
  }
}


function main() {
  var server = getServer();

  process.on('SIGINT', shutdownHandler(server));
  process.on('SIGTERM', shutdownHandler(server));

  console.log('listening for pnode connections on', bindOnAddr);
  server.bind(bindOnAddr, grpc.ServerCredentials.createInsecure());
  server.start();
}

main();
