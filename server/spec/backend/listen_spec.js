var test = require('tape');
var WebSocket = require('ws');
var testPort = require('../helpers/testPort');

var port = testPort();
var server = new WebSocket.Server({ port: port });
var sharedSocket = require('../../src/SharedSocket');
var listen = require('../../src/listen.ts');

test('listen', (t) => {
  sharedSocket.open('ws://localhost:' + port);

  listen((message) => {
    t.deepLooseEqual(
      message,
      { type: 'YASS', payload: 'yay' },
      'it calls listeners with deserialized messages'
    );
    sharedSocket.close();
    server.close(() => t.end());
  });

  server.on('connection', (ws) => {
    ws.send(JSON.stringify({
      type: 'YASS',
      payload: 'yay',
    }));
  });
});
