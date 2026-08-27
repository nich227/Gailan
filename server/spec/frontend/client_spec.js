//
//  client_spec.js
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
const sinon = require('sinon');
const path = require('path');

// The page's entry point. It waits for onload, asks the server for state, then
// pulls each widget in with a script tag, so the spec has to play the part of
// both the server and the browser's script loading.
const socketPath = require.resolve('../../src/SharedSocket');

const fakeSocket = {
  opened: [],
  sent: [],
  messageListeners: [],
  openListeners: [],
  open: (url, token) => fakeSocket.opened.push({url: url, token: token}),
  close: () => {},
  isOpen: () => true,
  send: (data) => fakeSocket.sent.push(data),
  onMessage: (listener) => fakeSocket.messageListeners.push(listener),
  onOpen: (listener) => fakeSocket.openListeners.push(listener),
  deliver: (action) =>
    fakeSocket.messageListeners.forEach((f) => f(JSON.stringify(action))),
};

// stand in before anything requires the real one
require.cache[socketPath] = {
  id: socketPath,
  filename: socketPath,
  loaded: true,
  exports: fakeSocket,
};

let stateResponse = {widgets: {}, settings: {}, screens: [1]};
let stateFails = false;

const $ = require('jquery');
$.get = () => {
  const promise = {
    done: (handler) => {
      if (!stateFails) handler(JSON.stringify(stateResponse));
      return promise;
    },
    fail: (handler) => {
      if (stateFails) handler('the server said no');
      return promise;
    },
  };
  return promise;
};

// a script tag for a widget resolves as soon as the widget registers itself
const realAppend = document.head.appendChild.bind(document.head);
document.head.appendChild = (node) => {
  if (node.tagName === 'SCRIPT' && String(node.src).indexOf('/widgets/') > -1) {
    const id = node.id;
    // a widget whose bundle will not load at all
    if (id === 'unloadable-widget') {
      realAppend(node);
      setTimeout(() => node.onerror && node.onerror(new Error('404')), 0);
      return node;
    }
    globalThis.__gailanWidgets = globalThis.__gailanWidgets || {};
    globalThis.__gailanWidgets[id] = {
      render: () => require('react').createElement('p', null, id),
    };
    realAppend(node);
    setTimeout(() => node.onload && node.onload(), 0);
    return node;
  }
  return realAppend(node);
};

function preparePage() {
  document.body.innerHTML = '';
  const container = document.createElement('div');
  container.id = 'gailan';
  container.innerHTML = 'left over from the last render';
  document.body.appendChild(container);

  const link = document.createElement('link');
  link.rel = 'stylesheet';
  link.href = 'http://localhost/userMain.css';
  document.head.appendChild(link);

  window.history.replaceState({}, '', '/1/background');
  return container;
}

function settle() {
  return new Promise((resolve) => setTimeout(resolve, 60));
}

const client = require(path.join(__dirname, '..', '..', 'client.ts'));

test('the module registry widgets resolve against', (t) => {
  t.equal(
    globalThis.require('gailan'),
    require('../../src/gailan.ts'),
    'a widget asking for gailan gets the real module'
  );
  t.equal(
    globalThis.require('uebersicht'),
    require('../../src/gailan.ts'),
    'and the old name works too'
  );
  t.throws(
    () => globalThis.require('some-package'),
    /Cannot find module 'some-package'/,
    'anything else is refused, rather than silently undefined'
  );
  t.end();
});

test('starting up', async (t) => {
  const container = preparePage();
  stateResponse = {
    widgets: {'a-widget': {id: 'a-widget', filePath: '/w/a-widget.jsx'}},
    settings: {'a-widget': {showOnAllScreens: true}},
    screens: [1],
  };

  window.onload();
  await settle();

  t.ok(
    ['dark', 'light'].indexOf(
      document.documentElement.dataset.appearance
    ) > -1,
    'widgets are told the appearance'
  );
  t.equal(fakeSocket.opened.length, 1, 'the socket is opened once');
  t.ok(
    fakeSocket.opened[0].url.indexOf('ws://') === 0,
    'against the page host'
  );
  t.notEqual(
    container.innerHTML,
    'left over from the last render',
    'the container is cleared before rendering'
  );
  t.end();
});

test('a widget arriving while running', async (t) => {
  preparePage();
  window.onload();
  await settle();

  fakeSocket.deliver({
    type: 'WIDGET_ADDED',
    payload: {id: 'late-widget', filePath: '/w/late-widget.jsx'},
  });
  await settle();

  t.ok(
    globalThis.__gailanWidgets['late-widget'],
    'it is fetched and registered'
  );
  t.end();
});

test('a widget that arrived broken is not fetched', async (t) => {
  preparePage();
  window.onload();
  await settle();

  delete globalThis.__gailanWidgets['broken-widget'];
  fakeSocket.deliver({
    type: 'WIDGET_ADDED',
    payload: {id: 'broken-widget', error: '{"message":"nope"}'},
  });
  await settle();

  t.notOk(
    globalThis.__gailanWidgets['broken-widget'],
    'there is no bundle to ask for'
  );
  t.end();
});

test('the stylesheet being reloaded', async (t) => {
  preparePage();
  window.onload();
  await settle();

  const link = Array.from(document.querySelectorAll('link')).find(
    (el) => el.href.indexOf('userMain.css') > -1
  );
  const before = link.href;

  fakeSocket.deliver({type: 'MASTER_STYLE_CHANGED'});
  await settle();

  t.notEqual(link.href, before, 'the href changes so the browser refetches');
  t.ok(link.href.indexOf('userMain.css?') > -1, 'with a cache buster');
  t.end();
});

test('an action meant for the store', async (t) => {
  preparePage();
  window.onload();
  await settle();

  t.doesNotThrow(
    () => fakeSocket.deliver({type: 'WIDGET_SET_TO_HIDE', payload: 'a-widget'}),
    'settings changes are dispatched without complaint'
  );
  t.end();
});

test('a refresh request for a widget', async (t) => {
  preparePage();
  window.onload();
  await settle();

  t.doesNotThrow(
    () => fakeSocket.deliver({type: 'WIDGET_WANTS_REFRESH', payload: 'a-widget'}),
    'a refresh for a widget that is not rendered is harmless'
  );
  t.end();
});

test('the right click menu', (t) => {
  const event = new window.MouseEvent('contextmenu', {
    bubbles: true,
    cancelable: true,
  });
  window.dispatchEvent(event);

  t.ok(event.defaultPrevented, 'is suppressed, this is a desktop not a page');
  t.end();
});

test('the deprecated background slice helper', (t) => {
  const warnings = [];
  const realWarn = console.warn;
  console.warn = (message) => warnings.push(message);

  window.gailan.makeBgSlice();
  console.warn = realWarn;

  t.equal(warnings.length, 1, 'it warns rather than working');
  t.ok(
    warnings[0].indexOf('backdrop-filter') > -1,
    'and says what to use instead'
  );
  t.end();
});

test('the state request failing', (t) => {
  preparePage();
  stateFails = true;

  // bail schedules a page reload ten seconds out. jsdom cannot navigate, and
  // letting that timer fire during a later spec takes the run down with it, so
  // time is held still here.
  const clock = sinon.useFakeTimers({toFake: ['setTimeout']});
  const logged = [];
  const realLog = console.log;
  console.log = (message) => logged.push(message);

  window.onload();

  console.log = realLog;
  clock.restore();
  stateFails = false;

  t.equal(logged.length, 1, 'the failure is reported');
  t.equal(
    logged[0],
    'the server said no',
    'with what the server said, rather than an undefined variable'
  );
  t.end();
});

test('a widget whose bundle will not load', async (t) => {
  preparePage();
  window.onload();
  await settle();

  const rejections = [];
  const onRejection = (err) => rejections.push(err);
  process.on('unhandledRejection', onRejection);

  fakeSocket.deliver({
    type: 'WIDGET_ADDED',
    payload: {id: 'unloadable-widget', filePath: '/w/unloadable-widget.jsx'},
  });
  await settle();

  process.removeListener('unhandledRejection', onRejection);
  t.notOk(
    globalThis.__gailanWidgets['unloadable-widget'],
    'nothing is registered for it'
  );
  t.equal(
    document.querySelectorAll('script#unloadable-widget').length,
    0,
    'and the script tag is cleaned up rather than left behind'
  );
  t.end();
});
