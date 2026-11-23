'use strict';

const test = require('tape');
const connect = require('connect');
const http = require('http');
const fs = require('fs');
const os = require('os');
const path = require('path');
const sinon = require('sinon');
const commandServer = require('../../src/command_server.ts');

async function start() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'gailan-shared-poll-'));
  const server = http.createServer(
    connect().use(commandServer(root, false, 'zsh')),
  );
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  return {
    root,
    port: server.address().port,
    async close() {
      server.closeAllConnections();
      await new Promise((resolve) => server.close(resolve));
      fs.rmSync(root, {recursive: true, force: true});
    },
  };
}

function request(server, command, key, interval = 1000) {
  const headers =
    key === undefined
      ? {}
      : {
          'X-Gailan-Poll-Key': key,
          'X-Gailan-Poll-Interval': String(interval),
        };
  return new Promise((resolve, reject) => {
    const req = http.request(
      {
        host: '127.0.0.1',
        port: server.port,
        path: '/run/',
        method: 'POST',
        headers,
        agent: false,
      },
      (res) => {
        let body = '';
        res.on('data', (chunk) => {
          body += chunk;
        });
        res.on('end', () => resolve({status: res.statusCode, body}));
      },
    );
    req.on('error', reject);
    req.end(command);
  });
}

const READ = 'printf x >> runs; printf reading';

test('three displays share one scheduled shell read', async (t) => {
  const server = await start();
  try {
    const replies = await Promise.all(
      [1, 2, 3].map(() => request(server, READ, 'one-widget')),
    );
    t.deepEqual(
      replies,
      [1, 2, 3].map(() => ({status: 200, body: 'reading'})),
      'every view gets the same output',
    );
    t.equal(
      fs.readFileSync(path.join(server.root, 'runs'), 'utf8'),
      'x',
      'the shell command executes only once',
    );
    await request(server, READ, 'one-widget');
    t.equal(
      fs.readFileSync(path.join(server.root, 'runs'), 'utf8'),
      'x',
      'a later view reuses the current reading',
    );
  } finally {
    await server.close();
  }
  t.end();
});

test('direct actions do not reuse scheduled readings', async (t) => {
  const server = await start();
  try {
    await request(server, READ, 'one-widget');
    await Promise.all([request(server, READ), request(server, READ)]);
    t.equal(
      fs.readFileSync(path.join(server.root, 'runs'), 'utf8'),
      'xxx',
      'each direct action executes independently',
    );
    await request(server, READ, 'one-widget');
    t.equal(
      fs.readFileSync(path.join(server.root, 'runs'), 'utf8'),
      'xxxx',
      'a later scheduled read cannot return the result from before the action',
    );
  } finally {
    await server.close();
  }
  t.end();
});

test('widget contexts, commands and intervals remain separate', async (t) => {
  const server = await start();
  try {
    await request(server, READ, 'first-widget');
    await request(server, READ, 'second-widget');
    await request(server, READ + '; printf changed', 'first-widget');
    await request(server, READ, 'first-widget', 2000);
    t.equal(
      fs.readFileSync(path.join(server.root, 'runs'), 'utf8'),
      'xxxx',
      'none of the different requests is collapsed',
    );
  } finally {
    await server.close();
  }
  t.end();
});

test('scheduled reads expire before the next interval', async (t) => {
  const server = await start();
  const clock = sinon.useFakeTimers({
    toFake: ['Date', 'setTimeout', 'clearTimeout'],
  });
  try {
    await request(server, READ, 'one-widget');
    await request(server, READ, 'one-widget');
    t.equal(
      fs.readFileSync(path.join(server.root, 'runs'), 'utf8'),
      'x',
      'the same interval shares a reading',
    );
    clock.tick(1000);
    await request(server, READ, 'one-widget');
    t.equal(
      fs.readFileSync(path.join(server.root, 'runs'), 'utf8'),
      'xx',
      'the next interval collects again',
    );
  } finally {
    await server.close();
    clock.restore();
  }
  t.end();
});

test('a failed scheduled read can recover without retaining its error', async (t) => {
  const server = await start();
  const command =
    'if [ ! -f ready ]; then touch ready; printf failure >&2; else printf recovered; fi';
  try {
    t.deepEqual(
      await request(server, command, 'one-widget'),
      {status: 500, body: 'failure'},
      'the failure reaches the view',
    );
    t.deepEqual(
      await request(server, command, 'one-widget'),
      {status: 200, body: 'recovered'},
      'the next request can recover',
    );
  } finally {
    await server.close();
  }
  t.end();
});

test('the same widget in different working directories does not share a read', async (t) => {
  const first = await start();
  const second = await start();
  try {
    await Promise.all([
      request(first, READ, 'one-widget'),
      request(second, READ, 'one-widget'),
    ]);
    t.equal(
      fs.readFileSync(path.join(first.root, 'runs'), 'utf8'),
      'x',
      'the first server executes in its directory',
    );
    t.equal(
      fs.readFileSync(path.join(second.root, 'runs'), 'utf8'),
      'x',
      'the second server has its own reading',
    );
  } finally {
    await first.close();
    await second.close();
  }
  t.end();
});
