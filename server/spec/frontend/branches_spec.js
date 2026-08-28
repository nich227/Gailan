//
//  branches_spec.js
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
const fakeServer = require('nise').fakeServer;
const runCommand = require('../../src/runCommand.ts');
const runShellCommand = require('../../src/runShellCommand');
const RenderLoop = require('../../src/renderLoop');
const reportGlassRegions = require('../../src/reportGlassRegions');
const Widget = require('../../src/Widget.ts');

// The odd corners: a command that is a function, a command promise with nobody
// waiting on a callback, a widget that patches its own dom, and a claim with no
// radius on it.

test('a command that is a function', (t) => {
  let calledWith = null;
  const widget = {
    command: function (callback) {
      // `this` is the widget, which is what lets a command reach its own state
      calledWith = this === widget ? 'the widget' : 'something else';
      callback(null, 'from a function');
    },
    refreshFrequency: 1000,
  };

  runCommand(widget, (err, output) => {
    t.error(err, 'no error');
    t.equal(output, 'from a function', 'the output comes back');
    t.equal(calledWith, 'the widget', 'and the command ran as the widget');
    t.end();
  });
});

test('a widget with no command at all', (t) => {
  runCommand({refreshFrequency: 1000}, (err, output) => {
    t.error(err, 'no error');
    t.equal(output, undefined, 'and nothing to report');
    t.end();
  });
});

test('running a command as a promise', (t) => {
  const server = fakeServer.create();
  server.respondWith('POST', '/run/', [
    200,
    {'Content-Type': 'text/plain'},
    'from a promise',
  ]);

  runShellCommand('echo hi')
    .then((output) => {
      t.equal(output, 'from a promise', 'the text resolves');
      server.restore();
      t.end();
    })
    .catch((err) => {
      server.restore();
      t.fail('it rejected: ' + err.message);
      t.end();
    });

  setTimeout(() => server.respond(), 10);
});

test('a command promise that fails', (t) => {
  const server = fakeServer.create();
  server.respondWith('POST', '/run/', [
    500,
    {'Content-Type': 'text/plain'},
    'no such command',
  ]);

  runShellCommand('nope')
    .then(() => {
      server.restore();
      t.fail('it resolved');
      t.end();
    })
    .catch((err) => {
      t.ok(err, 'it rejects');
      t.equal(err.message, 'no such command', "with the server's complaint");
      server.restore();
      t.end();
    });

  setTimeout(() => server.respond(), 10);
});

test('a claimed region with no radius given', (t) => {
  document.body.innerHTML = '';
  const el = document.createElement('div');
  el.id = 'no-radius';
  el.setAttribute('data-gailan-desktop-glass', '');
  el.getBoundingClientRect = () => ({
    left: 0,
    top: 0,
    width: 100,
    height: 50,
  });
  document.body.appendChild(el);

  const sent = [];
  window.webkit = {
    messageHandlers: {gailan: {postMessage: (m) => sent.push(m)}},
  };

  reportGlassRegions();

  requestAnimationFrame(() => {
    const region = sent[sent.length - 1].regions.find(
      (r) => r.id === 'no-radius'
    );
    t.ok(region, 'the region is still claimed');
    t.equal(region.radius, 0, 'with a square corner rather than NaN');
    el.remove();
    t.end();
  });
});

test('a classic widget that patches its own dom', (t) => {
  const patched = [];
  const widget = Widget({
    id: 'patching-widget',
    filePath: '/widgets/patching-widget.js',
    implementation: {
      command: (callback) => callback(null, 'one'),
      render: () => '<div class="bar"></div>',
      update: (output, domEl) => patched.push([output, domEl.className]),
      afterRender: () => {},
    },
  });

  const el = widget.create();
  document.body.appendChild(el);

  setTimeout(() => {
    t.equal(patched.length, 1, 'update runs after the first full render');
    t.equal(patched[0][0], 'one', 'with the command output');

    // from here the widget patches rather than re-rendering
    widget.forceRefresh();
    setTimeout(() => {
      t.equal(patched.length, 2, 'and again without a re-render');
      widget.destroy();
      t.end();
    }, 60);
  }, 60);
});

test('a classic widget whose markup contains a script', (t) => {
  const widget = Widget({
    id: 'scripted-widget',
    filePath: '/widgets/scripted-widget.js',
    implementation: {
      command: (callback) => callback(null, 'ready'),
      render: () => '<div><script src="/widgets/helper.js"></script></div>',
      afterRender: () => {},
    },
  });

  const el = widget.create();
  document.body.appendChild(el);

  setTimeout(() => {
    const script = el.querySelector('script');
    t.ok(script, 'the script survives');
    t.ok(
      script.src.indexOf('/widgets/helper.js') > -1,
      'and is replaced with one the browser will actually fetch'
    );
    widget.destroy();
    t.end();
  }, 60);
});
