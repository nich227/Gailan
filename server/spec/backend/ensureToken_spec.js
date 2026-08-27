var test = require('tape');
var ensureToken = require('../../src/ensureToken');

function run(middleware, req) {
  var out = {status: null, headers: {}, nexted: false};
  var res = {
    writeHead: (s) => (out.status = s),
    setHeader: (k, v) => (out.headers[k] = v),
    end: () => {},
  };
  middleware(req, res, () => (out.nexted = true));
  return out;
}

test('requests without the token', (t) => {
  var out = run(ensureToken('sekrit'), {url: '/state/', headers: {}});
  t.equal(out.status, 403, 'they are refused');
  t.notOk(out.nexted, 'and do not reach the app');
  t.end();
});

test('requests with the token cookie', (t) => {
  var out = run(ensureToken('sekrit'), {
    url: '/state/',
    headers: {cookie: 'token=sekrit'},
  });
  t.ok(out.nexted, 'pass through');
  t.end();
});

test('the first page load carries the token as a query parameter', (t) => {
  var out = run(ensureToken('sekrit'), {
    url: '/0/foreground?token=sekrit',
    headers: {},
  });
  t.ok(out.nexted, 'it passes');
  t.ok(
    /^token=sekrit; HttpOnly/.test(out.headers['Set-Cookie']),
    'and sets the cookie everything after rides on'
  );
  var wrong = run(ensureToken('sekrit'), {
    url: '/0/foreground?token=nope',
    headers: {},
  });
  t.equal(wrong.status, 403, 'a wrong query token is refused');
  t.end();
});

test('disabled mode', (t) => {
  var out = run(ensureToken('sekrit', true), {url: '/state/', headers: {}});
  t.ok(out.nexted, 'lets everything through');
  t.end();
});
