//
//  socket_spec.js
//  Gailan
//
//  Copyright (c) 2026 Kevin Chen.
//
//  Released under the terms of the GNU General Public License as published by
//  the Free Software Foundation, either version 3 of the License, or
//  (at your option) any later version. See <http://www.gnu.org/licenses/> for
//  details.
//
'use strict';

const test = require('tape');
const html = require('react').createElement;
const Widget = require('../../src/Widget.js');

// SharedSocket picks the browser's WebSocket when there is a window, which is
// the half the backend specs never see. client_spec replaces the module for the
// whole process, so this loads a fresh copy.
const socketPath = require.resolve('../../src/SharedSocket');
delete require.cache[socketPath];

const sockets = [];

class FakeWebSocket {
  constructor(url, protocols, options) {
    this.url = url;
    this.protocols = protocols;
    this.options = options;
    this.sent = [];
    this.closed = false;
    sockets.push(this);
  }

  send(data) {
    this.sent.push(data);
  }

  close() {
    this.closed = true;
  }
}

const realWebSocket = window.WebSocket;
window.WebSocket = FakeWebSocket;
const sharedSocket = require(socketPath);
window.WebSocket = realWebSocket;

test('opening the socket in a page', (t) => {
  const opened = [];
  const messages = [];
  sharedSocket.onOpen(() => opened.push(true));
  sharedSocket.onMessage((m) => messages.push(m));

  sharedSocket.open('ws://127.0.0.1:41416', 'a-token');
  const socket = sockets[sockets.length - 1];

  t.equal(socket.url, 'ws://127.0.0.1:41416', 'against the url given');
  t.notOk(sharedSocket.isOpen(), 'it is not open until the socket says so');

  // a browser WebSocket has no .on, so the handlers are assigned as properties
  socket.onopen();
  t.ok(sharedSocket.isOpen(), 'once open, it reports so');
  t.equal(opened.length, 1, 'and the open listeners run');

  socket.onmessage({data: 'a message'});
  t.deepEqual(messages, ['a message'], 'messages reach the listeners');

  sharedSocket.send('outbound');
  t.deepEqual(socket.sent, ['outbound'], 'sending goes to the socket');

  socket.onclose();
  t.notOk(sharedSocket.isOpen(), 'closing is noticed');

  t.end();
});

test('a socket that errors', (t) => {
  const errors = [];
  const realError = console.error;
  console.error = (err) => errors.push(err);

  sharedSocket.open('ws://127.0.0.1:41416');
  const socket = sockets[sockets.length - 1];
  socket.onerror(new Error('the socket fell over'));

  console.error = realError;
  t.equal(errors.length, 1, 'it is reported rather than thrown');
  t.notOk(socket.options.headers, 'and with no token there is no cookie header');
  t.end();
});

test('closing the socket', (t) => {
  sharedSocket.open('ws://127.0.0.1:41416');
  const socket = sockets[sockets.length - 1];

  sharedSocket.close();
  t.ok(socket.closed, 'the socket is closed');
  t.notOk(sharedSocket.isOpen(), 'and no longer reported open');
  t.end();
});

test('dispatching while the socket is open', (t) => {
  // dispatch holds messages until the socket opens, then drains them
  delete require.cache[require.resolve('../../src/dispatch')];
  const dispatch = require('../../src/dispatch.ts');

  sharedSocket.open('ws://127.0.0.1:41416');
  const socket = sockets[sockets.length - 1];

  dispatch({type: 'WHILE_CLOSED'});
  t.deepEqual(socket.sent, [], 'nothing goes out before the socket opens');

  socket.onopen();
  t.equal(socket.sent.length, 1, 'the queue drains on open');

  dispatch({type: 'WHILE_OPEN'});
  t.equal(socket.sent.length, 2, 'and later messages go straight out');
  t.deepEqual(
    JSON.parse(socket.sent[1]),
    {type: 'WHILE_OPEN'},
    'serialized as json'
  );
  t.end();
});

test('a react widget whose command is a shell string', (t) => {
  const widget = Widget({
    id: 'shell-widget',
    filePath: '/widgets/shell-widget.jsx',
    implementation: {
      command: 'echo hi',
      render: ({output, error}) =>
        html('p', null, error ? 'failed' : String(output)),
    },
  });

  const el = widget.create();
  setTimeout(() => {
    t.ok(el.querySelector('p'), 'it renders, whatever the request did');
    widget.destroy();
    t.end();
  }, 80);
});

test('a react widget whose updateState throws', (t) => {
  const realFetch = global.fetch;
  global.fetch = () =>
    Promise.resolve({
      json: () => Promise.resolve({path: 'w.jsx', line: 1, column: 0, lines: []}),
    });

  const widget = Widget({
    id: 'bad-state-widget',
    filePath: '/widgets/bad-state-widget.jsx',
    implementation: {
      command: () => 'output',
      refreshFrequency: 10,
      updateState: () => {
        throw new Error('updateState blew up');
      },
      render: () => html('p', null, 'first render'),
    },
  });

  const el = widget.create();
  setTimeout(() => {
    // the throw is caught and turned into the error view rather than left to
    // take the page down. which of the two is on screen depends on the command
    // timing, so what matters is that the widget survived it.
    t.ok(el.textContent.length > 0, 'the widget is still showing something');
    global.fetch = realFetch;
    widget.destroy();
    t.end();
  }, 150);
});
