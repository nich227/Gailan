'use strict';

const WebSocket = require('ws');

module.exports = function MessageBus(options) {
  const wss = new WebSocket.Server(options);

  // ws delivers every message as a Buffer and send() defaults to a binary
  // frame, but the mac app's listener only understands text frames, which is
  // also what ws 6 used to rebroadcast
  function broadcast(data, isBinary) {
    wss.clients.forEach((client) => {
      if (client.readyState === WebSocket.OPEN) {
        client.send(data, {binary: isBinary});
      }
    });
  }

  wss.on('connection', function connection(ws) {
    ws.on('message', broadcast);
  });

  wss.on('error', function handleError(err) {
    console.error(err);
  });

  return wss;
};
