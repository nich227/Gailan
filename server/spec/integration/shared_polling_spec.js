'use strict';

const test = require('tape');
const http = require('http');
const fs = require('fs');
const os = require('os');
const path = require('path');
const testPort = require('../helpers/testPort');
const GailanServer = require('../../src/app.ts');

function post(port, command, headers) {
  return new Promise((resolve, reject) => {
    const req = http.request(
      {
        host: '127.0.0.1',
        port,
        path: '/run/',
        method: 'POST',
        agent: false,
        headers: {
          host: '127.0.0.1:' + port,
          origin: 'http://127.0.0.1:' + port,
          ...headers,
        },
      },
      (res) => {
        let body = '';
        res.on('data', (chunk) => {
          body += chunk;
        });
        res.on('end', () =>
          resolve({
            status: res.statusCode,
            body,
            cacheControl: res.headers['cache-control'],
          }),
        );
      },
    );
    req.on('error', reject);
    req.end(command);
  });
}

test('authenticated display copies share reads without bypassing the token or origin gate', async (t) => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'gailan-shared-auth-'));
  const widgets = path.join(root, 'widgets');
  fs.mkdirSync(widgets);
  fs.writeFileSync(
    path.join(widgets, 'reading.js'),
    'command: "echo reading", render: (output) => output',
  );
  const port = testPort();
  const token = 'shared-reading-test-token';
  let server;
  await new Promise((resolve, reject) => {
    server = GailanServer(
      port,
      widgets,
      path.join(root, 'settings'),
      path.join(__dirname, '../../release/public'),
      token,
      {shell: 'zsh'},
      resolve,
    );
    server.on('error', reject);
  });
  const headers = {
    'X-Gailan-Poll-Key': 'reading-widget',
    'X-Gailan-Poll-Interval': '1000',
  };
  const command = 'printf x >> runs; printf reading';
  try {
    const anonymous = await post(port, command, headers);
    t.equal(
      anonymous.status,
      403,
      'scheduled-read metadata does not admit an anonymous caller',
    );
    t.notOk(
      fs.existsSync(path.join(widgets, 'runs')),
      'the denied request never executes',
    );
    const authenticated = {...headers, cookie: 'token=' + token};
    const replies = await Promise.all(
      [1, 2, 3].map(() => post(port, command, authenticated)),
    );
    t.ok(
      replies.every(
        (reply) => reply.status === 200 && reply.body === 'reading',
      ),
      'every authenticated display receives the reading',
    );
    t.ok(
      replies.every((reply) => reply.cacheControl === 'no-store'),
      'the private result is not HTTP-cacheable',
    );
    t.equal(
      fs.readFileSync(path.join(widgets, 'runs'), 'utf8'),
      'x',
      'three display-style requests execute only once',
    );
    const wrongOrigin = await post(port, command, {
      ...authenticated,
      origin: 'http://another-site.invalid',
    });
    t.equal(
      wrongOrigin.status,
      403,
      'a valid token does not bypass the origin gate',
    );
    t.equal(
      fs.readFileSync(path.join(widgets, 'runs'), 'utf8'),
      'x',
      'the denied origin never executes',
    );
  } finally {
    await new Promise((resolve) => server.close(resolve));
    fs.rmSync(root, {recursive: true, force: true});
  }
  t.end();
});
