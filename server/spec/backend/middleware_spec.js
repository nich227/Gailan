//
//  middleware_spec.js
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
const disallowIFraming = require('../../src/disallowIFraming.ts');
const ensureSameHost = require('../../src/ensureSameHost.ts');
const ensureSameOrigin = require('../../src/ensureSameOrigin');

// The guards in front of everything else. They are four lines each and the
// whole point of them is the request they turn away.
function fakeExchange(request) {
  const res = {
    headers: {},
    status: null,
    ended: false,
    setHeader: (key, value) => {
      res.headers[key] = value;
    },
    writeHead: (status) => {
      res.status = status;
    },
    end: () => {
      res.ended = true;
    },
  };
  let passed = false;
  return {
    req: Object.assign({method: 'GET', headers: {}}, request),
    res: res,
    next: () => {
      passed = true;
    },
    get passed() {
      return passed;
    },
  };
}

test('refusing to be framed', (t) => {
  const call = fakeExchange({});
  disallowIFraming(call.req, call.res, call.next);

  t.equal(
    call.res.headers['X-Frame-Options'],
    'sameorigin',
    'every response says so'
  );
  t.ok(call.passed, 'and the request carries on');
  t.end();
});

test('requiring the right host', (t) => {
  const middleware = ensureSameHost('127.0.0.1:41416');

  const right = fakeExchange({headers: {host: '127.0.0.1:41416'}});
  middleware(right.req, right.res, right.next);
  t.ok(right.passed, 'the expected host is let through');

  const wrong = fakeExchange({headers: {host: 'evil.example.com'}});
  middleware(wrong.req, wrong.res, wrong.next);
  t.notOk(wrong.passed, 'another host is not');
  t.equal(wrong.res.status, 400, 'it gets a 400');
  t.ok(wrong.res.ended, 'and nothing else');

  const missing = fakeExchange({headers: {}});
  middleware(missing.req, missing.res, missing.next);
  t.notOk(missing.passed, 'neither is a request with no host at all');
  t.equal(missing.res.status, 400, 'also a 400');
  t.end();
});

test('requiring the right origin', (t) => {
  const middleware = ensureSameOrigin('http://127.0.0.1:41416');

  const read = fakeExchange({method: 'GET', headers: {}});
  middleware(read.req, read.res, read.next);
  t.ok(read.passed, 'a GET needs no origin, since it changes nothing');

  const write = fakeExchange({
    method: 'POST',
    headers: {origin: 'http://127.0.0.1:41416'},
  });
  middleware(write.req, write.res, write.next);
  t.ok(write.passed, 'a POST from our own page is fine');

  const crossSite = fakeExchange({
    method: 'POST',
    headers: {origin: 'http://evil.example.com'},
  });
  middleware(crossSite.req, crossSite.res, crossSite.next);
  t.notOk(crossSite.passed, 'a POST from elsewhere is not');
  t.equal(crossSite.res.status, 403, 'it gets a 403');
  t.ok(crossSite.res.ended, 'and nothing else');

  const anonymous = fakeExchange({method: 'POST', headers: {}});
  middleware(anonymous.req, anonymous.res, anonymous.next);
  t.notOk(anonymous.passed, 'nor one with no origin header');
  t.equal(anonymous.res.status, 403, 'also a 403');
  t.end();
});
