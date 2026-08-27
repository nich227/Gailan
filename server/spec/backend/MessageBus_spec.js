var test = require('tape');
var WebSocket = require('ws');
var testPort = require('../helpers/testPort');
var MessageBus = require('../../src/MessageBus');

// the mac app's SocketRocket client only understands text frames, so a text
// frame in must come back out as a text frame, not binary
test('rebroadcasting preserves the frame type', (t) => {
  var port = testPort(8890);
  var bus = MessageBus({port: port});

  var sender = new WebSocket('ws://localhost:' + port);
  var receiver = new WebSocket('ws://localhost:' + port);

  receiver.on('message', (data, isBinary) => {
    t.equal(isBinary, false, 'a text frame stays a text frame');
    t.equal(String(data), '{"type":"PING"}', 'payload intact');
    sender.close();
    receiver.close();
    bus.close(() => t.end());
  });

  var ready = 0;
  var whenReady = () => {
    if (++ready === 2) sender.send('{"type":"PING"}');
  };
  sender.on('open', whenReady);
  receiver.on('open', whenReady);
});
