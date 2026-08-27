//
//  error_paths_spec.js
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
const fs = require('fs');
const os = require('os');
const path = require('path');
const connect = require('connect');
const http = require('http');
const testPort = require('../helpers/testPort');
const Settings = require('../../src/Settings');
const MessageBus = require('../../src/MessageBus');
const widgetify = require('../../src/widgetify');
const commandServer = require('../../src/command_server.ts');
const serveWidgets = require('../../src/serveWidgets');

// The paths that only run when something goes wrong, which is exactly when they
// matter and never when a spec is being polite.

test('settings that cannot be written', (t) => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'gailan-settings-'));
  // a directory where the settings file should be, so writing it fails
  fs.mkdirSync(path.join(dir, 'settings'));
  fs.mkdirSync(path.join(dir, 'settings', 'WidgetSettings.json'));

  const logged = [];
  const realLog = console.log;
  console.log = (message) => logged.push(message);

  const settings = Settings(path.join(dir, 'settings'));
  settings.persist({'a-widget': {hidden: true}});

  setTimeout(() => {
    console.log = realLog;
    t.equal(logged.length, 1, 'the failure is reported rather than thrown');
    fs.rmSync(dir, {recursive: true, force: true});
    t.end();
  }, 100);
});

test('settings that arrive while a write is running', (t) => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'gailan-settings-'));
  const file = path.join(dir, 'settings');
  const settings = Settings(file);

  settings.persist({round: 1});
  settings.persist({round: 2});
  settings.persist({round: 3});

  setTimeout(() => {
    const written = JSON.parse(fs.readFileSync(file, 'utf8'));
    t.deepEqual(written, {round: 3}, 'the newest state is the one on disk');
    fs.rmSync(dir, {recursive: true, force: true});
    t.end();
  }, 200);
});

test('settings that are already what we have', (t) => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'gailan-settings-'));
  const file = path.join(dir, 'settings');
  const settings = Settings(file);
  const state = {'a-widget': {hidden: false}};

  settings.persist(state);

  setTimeout(() => {
    const before = fs.statSync(file).mtimeMs;
    settings.persist(settings.load());

    setTimeout(() => {
      t.equal(
        fs.statSync(file).mtimeMs,
        before,
        'nothing is written when nothing changed'
      );
      fs.rmSync(dir, {recursive: true, force: true});
      t.end();
    }, 100);
  }, 100);
});

test('a message bus that errors', (t) => {
  const errors = [];
  const realError = console.error;
  console.error = (err) => errors.push(err);

  const server = http.createServer();
  server.listen(testPort(), '127.0.0.1', () => {
    const wss = MessageBus({server: server});
    wss.emit('error', new Error('the socket server gave up'));

    console.error = realError;
    t.equal(errors.length, 1, 'it reports rather than throwing');

    wss.close(() => server.close(() => t.end()));
  });
});

test('a widget whose style is built rather than written', (t) => {
  const source = [
    'var base = "top: 10px";',
    '({',
    '  command: "echo hi",',
    '  style: base,',
    '  render: (output) => output',
    '})',
  ].join('\n');

  const out = widgetify.transform(source, 'built-style');
  t.ok(out.indexOf('css') > -1, 'the built value is still compiled to css');
  t.ok(out.indexOf('#built-style') > -1, 'and scoped to the widget');
  t.end();
});

test('a widget whose style is not a string at all', (t) => {
  const source = '({\n  style: 42,\n  render: (output) => output\n})';

  const out = widgetify.transform(source, 'odd-style');
  t.ok(out.indexOf('42') > -1, 'it is left alone rather than compiled');
  t.end();
});

test('a file that is not a widget object', (t) => {
  const source = 'var notAWidget = 1;\n';

  t.equal(
    widgetify.transform(source, 'not-a-widget').indexOf('module.exports'),
    -1,
    'nothing is exported, since there was no object to export'
  );
  t.end();
});

test('a command that cannot be run', (t) => {
  const port = testPort();
  const server = connect()
    .use(commandServer('/tmp', false, 'no-such-shell-anywhere'))
    .listen(port, () => {
      const request = http.request(
        {port: port, path: '/run/', method: 'POST', agent: false},
        (res) => {
          let body = '';
          res.on('data', (chunk) => {
            body += chunk;
          });
          res.on('end', () => {
            t.equal(res.statusCode, 500, 'it answers with a failure');
            t.ok(body.length > 0, 'and says what went wrong');
            server.close(() => t.end());
          });
        }
      );
      request.end('echo hi');
    });
});

test('a widget bundle that cannot be read while being served', (t) => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'gailan-serve-err-'));
  const source =
    'var x = 1;\n//# sourceMappingURL=data:application/json;base64,' +
    Buffer.from(
      JSON.stringify({
        version: 3,
        sources: [path.join(dir, 'gone.jsx')],
        names: [],
        mappings: 'AAAA',
        sourcesContent: null,
      })
    ).toString('base64');

  const port = testPort();
  const server = connect()
    .use(serveWidgets({get: () => source}, dir))
    .listen(port, () => {
      http.get(
        {port: port, path: '/widgets/gone?line=1&column=0', agent: false},
        (res) => {
          res.resume();
          res.on('end', () => {
            t.ok(
              res.statusCode >= 400,
              'a source file that is not there is reported, not crashed on'
            );
            fs.rmSync(dir, {recursive: true, force: true});
            server.close(() => t.end());
          });
        }
      );
    });
});
