var test = require('tape');
var connect = require('connect');
var path = require('path');

var httpGet = require('../helpers/httpGet');
var testPort = require('../helpers/testPort');
var httpPost = require('../helpers/httpPost');
var commandServer = require('../../src/command_server.coffee');

var {execSync} = require('child_process');

function has(shell) {
  try { execSync('command -v ' + shell, {stdio: 'ignore'}); return true; }
  catch (e) { return false; }
}

// the default is zsh; on machines without it (linux dev boxes) the suite
// exercises the same plumbing through bash
var SHELL = has('zsh') ? 'zsh' : 'bash';
var IS_LOGIN =
  SHELL === 'zsh'
    ? '[[ -o login ]] && echo on || echo off'
    : 'shopt -q login_shell && echo on || echo off';

var workingDir = path.resolve(__dirname, path.join('..', 'test_widgets'));
var port = testPort(8887);
var server = connect().use(commandServer(workingDir, false, SHELL)).listen(port);

var url = 'http://localhost:' + port + '/run/';

test('responding to POST /run/', (t) => {
  t.plan(3);

  httpPost(url, 'echo', (res) => {
    t.equal(res.statusCode, 200, 'it reponds');
  });

  httpPost('http://localhost:' + port + '/foo/', 'echo', (res) => {
    t.equal(res.statusCode, 404, 'it ignores requests to other paths');
  });

  httpGet(url, (res) => {
    t.equal(res.statusCode, 404, 'it ignores GET requests');
  });
});

test('running commands', (t) => {
  t.plan(2);

  httpPost(url, 'echo "yay"', (res, body) => {
    t.equal(body, 'yay\n', 'it runs commands');
  });

  httpPost(url, 'pwd', (res, body) => {
    t.equal(
      body,
      workingDir + '\n',
      'it runs commands in the supplied working dir',
    );
  });
});

test('shell type', (t) => {
  httpPost(url, IS_LOGIN, (res, body) => {
    t.equal(body, 'off\n', 'it is not a login shell');
    t.end();
  });
});

if (has('fish')) {
  test('running commands in fish', (t) => {
    var fishPort = testPort(8886);
    var fishServer = connect()
      .use(commandServer(workingDir, false, 'fish'))
      .listen(fishPort);

    httpPost('http://localhost:' + fishPort + '/run/', 'status is-login; and echo on; or echo off', (res, body) => {
      t.equal(body, 'off\n', 'fish runs commands and is not a login shell');
      fishServer.closeAllConnections();
      fishServer.close(() => t.end());
    });
  });
}

test('running broken commands', (t) => {
  t.plan(2);

  httpPost(url, 'fake-command', (res, body) => {
    t.equal(res.statusCode, 500, 'it responds with a 500 code');
    t.equal(
      body,
      'bash: line 1: fake-command: command not found\n',
      'it responds with an error message',
    );
  });
});

test('forwarding stderr', (t) => {
  t.plan(2);

  httpPost(url, 'echo "yay" >&2', (res, body) => {
    t.equal(res.statusCode, 500, 'it responds with a 500 code');
    t.equal(body, 'yay\n', 'it sends stderr along');
  });
});

test('closing', (t) => {
  // close() only stops new connections; keep-alive sockets have to be dropped
  // too, or a client can still be holding one when the next server starts
  server.closeAllConnections();
  server.close(() => {
    t.pass('it closes');
    t.end();
  });
});

test('using a login shell', (t) => {
  // its own port, so nothing can be pointing at the server that just closed
  var loginPort = testPort(port + 1);
  var loginServer = connect()
    .use(commandServer(workingDir, true, SHELL))
    .listen(loginPort);

  httpPost('http://localhost:' + loginPort + '/run/', IS_LOGIN, (res, body) => {
    const lines = body.trim().split('\n');
    t.equal(
      lines[lines.length - 1],
      'on',
      'it indeed runs in a login shell',
    );
    loginServer.closeAllConnections();
    loginServer.close(() => t.end());
  });
});
