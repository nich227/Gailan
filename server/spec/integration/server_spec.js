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

// A test that never sees the server start used to leave its child alive and never
// call t.end(), which hung the run rather than failing it. Every child is tracked
// and every wait is bounded, so the suite either finishes or says what went wrong.
const spawned = [];
const READY_TIMEOUT = 20000;

function track(child) {
  spawned.push(child);
  return child;
}

test.onFinish(() => {
  spawned.forEach((child) => {
    if (child.exitCode === null && child.signalCode === null) {
      child.kill('SIGKILL');
    }
  });
});

function startServer(args, token, onReady, t) {
  const child = track(
    spawn(process.execPath, [entry].concat(args), {
      stdio: ['pipe', 'pipe', 'pipe'],
    })
  );

  let ready = false;
  const stuck = setTimeout(() => {
    if (ready) return;
    child.kill('SIGKILL');
    if (t) {
      t.fail('the server never said it started, output was: ' + output);
      t.end();
    }
  }, READY_TIMEOUT);

  let output = '';
  const watch = (chunk) => {
    output += chunk;
    collected += chunk;
    if (output.indexOf('server started on port') > -1) {
      ready = true;
      clearTimeout(stuck);
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
          collected.indexOf('CORS proxy on port ' + (port + 1)) > -1,
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
    },
    t
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
    },
    t
  );
});

test('the server refusing a widget directory that is not there', (t) => {
  const port = testPort();
  const child = track(
    spawn(
      process.execPath,
      [entry, '-p', String(port), '-d', '/no/such/widget/directory'],
      {stdio: ['pipe', 'pipe', 'pipe']}
    )
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

test('the long form of every argument', (t) => {
  const dirs = scratch();
  const port = testPort();

  startServer(
    [
      '--port',
      String(port),
      '--dir',
      dirs.widgets,
      '--settings',
      path.join(dirs.root, 'settings'),
      '--login-shell',
      '--shell',
      'zsh',
    ],
    'a-token',
    (proc) => {
      get(port, '/state/?token=a-token', (res) => {
        t.equal(res.statusCode, 200, '--port, --dir and --settings all work');
        proc.kill('SIGKILL');
        fs.rmSync(dirs.root, {recursive: true, force: true});
        t.end();
      });
    },
    t
  );
});

test('the server with no arguments at all', (t) => {
  // it falls back to ./widgets, ./settings and port 41416 beside the script,
  // which is how the app ships it
  const child = track(
    spawn(process.execPath, [entry], {
      stdio: ['pipe', 'pipe', 'pipe'],
    })
  );

  let output = '';
  const watch = (chunk) => {
    output += chunk;
  };
  child.stdout.on('data', watch);
  child.stderr.on('data', watch);
  child.stdin.end();

  setTimeout(() => {
    child.kill('SIGKILL');
    t.ok(
      output.indexOf('41416') > -1 ||
        output.indexOf('no such file or directory') > -1,
      'it falls back to ./widgets beside the script, and says so if it is absent'
    );
    t.end();
  }, 700);
});
