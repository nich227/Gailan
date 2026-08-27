//
//  server_spec.js
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
const http = require('http');
const {spawn} = require('child_process');
const testPort = require('../helpers/testPort');

// The entry point the app actually launches, run the way the app runs it:
// arguments for the port and widget directory, and the token on stdin.
const entry = path.join(__dirname, '..', '..', 'server.ts');

function scratch() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'gailan-entry-'));
  const widgets = path.join(root, 'widgets');
  fs.mkdirSync(widgets);
  fs.writeFileSync(
    path.join(widgets, 'entry-widget.js'),
    'command: "echo hi",\nrender: (output) => output\n'
  );
  return {root: root, widgets: widgets};
}

let collected = '';

function startServer(args, token, onReady) {
  const child = spawn(process.execPath, [entry].concat(args), {
    stdio: ['pipe', 'pipe', 'pipe'],
  });

  let output = '';
  const watch = (chunk) => {
    output += chunk;
    collected += chunk;
    if (output.indexOf('server started on port') > -1) {
      onReady(child, output);
      onReady = () => {};
    }
  };
  child.stdout.on('data', watch);
  child.stderr.on('data', watch);

  if (token !== null) {
    child.stdin.write(token);
  }
  child.stdin.end();

  return child;
}

function get(port, urlPath, callback) {
  http
    .get(
      {
        port: port,
        path: urlPath,
        host: '127.0.0.1',
        headers: {host: '127.0.0.1:' + port},
        agent: false,
      },
      (res) => {
        let body = '';
        res.on('data', (chunk) => {
          body += chunk;
        });
        res.on('end', () => callback(res, body));
      }
    )
    .on('error', () => callback({statusCode: 0}, ''));
}

test('the server the app launches', (t) => {
  const dirs = scratch();
  const port = testPort();
  const token = 'a-token-on-stdin';

  const child = startServer(
    ['-p', String(port), '-d', dirs.widgets, '-s', path.join(dirs.root, 'settings')],
    token,
    (proc, output) => {
      t.ok(output.indexOf('server started on port') > -1, 'it says it started');

      get(port, '/state/?token=' + token, (res) => {
        // the proxy announces itself just after the server, so by now both
        // lines have been written
        t.ok(
          collected.indexOf('CORS Anywhere on port ' + (port + 1)) > -1,
          'and it brings up the proxy beside it'
        );
        t.equal(res.statusCode, 200, 'the token from stdin is the one it wants');

        get(port, '/state/', (plain) => {
          t.equal(plain.statusCode, 403, 'and without it there is no state');
          proc.kill('SIGKILL');
          fs.rmSync(dirs.root, {recursive: true, force: true});
          t.end();
        });
      });
    }
  );

  child.on('error', (err) => {
    t.fail('could not start: ' + err.message);
    t.end();
  });
});

test('the server with the token turned off', (t) => {
  const dirs = scratch();
  const port = testPort();

  startServer(
    [
      '-p',
      String(port),
      '-d',
      dirs.widgets,
      '-s',
      path.join(dirs.root, 'settings'),
      '--disable-token',
    ],
    '',
    (proc) => {
      get(port, '/state/', (res) => {
        t.equal(res.statusCode, 200, 'the state is served without a token');
        proc.kill('SIGKILL');
        fs.rmSync(dirs.root, {recursive: true, force: true});
        t.end();
      });
    }
  );
});

test('the server refusing a widget directory that is not there', (t) => {
  const port = testPort();
  const child = spawn(
    process.execPath,
    [entry, '-p', String(port), '-d', '/no/such/widget/directory'],
    {stdio: ['pipe', 'pipe', 'pipe']}
  );

  let output = '';
  child.stderr.on('data', (chunk) => {
    output += chunk;
  });
  child.stdout.on('data', (chunk) => {
    output += chunk;
  });
  child.stdin.end();

  child.on('exit', (code) => {
    t.notEqual(code, 0, 'it exits with a failure');
    t.ok(
      output.indexOf('no such file or directory') > -1 ||
        output.indexOf('could not find') > -1,
      'saying it could not find the directory'
    );
    t.end();
  });
});
