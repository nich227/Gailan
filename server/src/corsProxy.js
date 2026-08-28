//
//  corsProxy.js
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

// A widget is served from http://127.0.0.1:<port>, so fetching anything else is
// a cross-origin request and the browser wants the other end to agree to it.
// Most of the web does not, hence a proxy: the widget asks this server for
// /https://example.com/thing, and gets an answer it is allowed to read.
//
// This replaces cors-anywhere, which is unmaintained and carries an advisory in
// every published version with no fix coming. The advisory is about running one
// of these openly on the internet. Ours listens on the loopback interface and
// answers only for the widget page's own origin, which is the boundary that
// matters: a page from somewhere else can reach 127.0.0.1 in your browser, but
// the browser sets Origin, so it cannot claim to be the widget page.

const http = require('http');
const https = require('https');
const dns = require('dns');

const MAX_REDIRECTS = 5;
const TIMEOUT = 30000;

const METHODS = ['GET', 'HEAD', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'];

// Headers that describe one hop and must not be forwarded to the next, plus
// cookies, which belong to the browser and not to whatever the widget is asking
// about.
const DROP_FROM_REQUEST = [
  'connection',
  'cookie',
  'cookie2',
  'host',
  'keep-alive',
  'origin',
  'proxy-authorization',
  'proxy-connection',
  'referer',
  'te',
  'trailer',
  'transfer-encoding',
  'upgrade',
];

const DROP_FROM_RESPONSE = [
  'connection',
  'keep-alive',
  'set-cookie',
  'set-cookie2',
  'transfer-encoding',
  'upgrade',
];

// 169.254/16 and fe80::/10 are where a machine's own metadata services live, and
// no widget has business there. Everything else, including this network, stays
// reachable: widgets that read a router page or a NAS are the ordinary case, and
// a widget can run shell commands anyway, so refusing them would cost
// compatibility and buy nothing.
function isLinkLocal(address) {
  if (address.startsWith('169.254.')) return true;

  const lower = address.toLowerCase();
  if (lower.startsWith('::ffff:169.254.')) return true;
  // fe80:: through febf::
  return /^fe[89ab][0-9a-f]:/.test(lower);
}

function parseTarget(requestUrl) {
  // everything after the leading slash is the address being asked about
  const raw = requestUrl.slice(1);
  if (!raw) return null;

  // cors-anywhere accepted a bare host and assumed http, so widgets may too.
  // Anything naming another scheme is refused rather than assumed: prepending
  // http:// to file:///etc/passwd asks for a host called "file", which is a
  // strange thing to do on someone's behalf.
  const scheme = /^([a-z][a-z0-9+.\-]*):/i.exec(raw);
  if (scheme) {
    const name = scheme[1].toLowerCase();
    const rest = raw.slice(scheme[0].length);
    // a bare host may carry a port, and that colon is not a scheme
    const isPort = /^\d/.test(rest);
    if (!isPort && name !== 'http' && name !== 'https') return null;
  }

  const hasWebScheme = /^https?:\/\//i.test(raw);
  const withScheme = hasWebScheme ? raw : `http://${raw}`;

  let url;
  try {
    url = new URL(withScheme);
  } catch {
    return null;
  }

  if (url.protocol !== 'http:' && url.protocol !== 'https:') return null;
  if (!url.hostname) return null;

  return url;
}

function corsHeaders(origin) {
  return {
    'access-control-allow-origin': origin,
    'access-control-allow-methods': METHODS.join(', '),
    'access-control-allow-headers': 'accept, authorization, content-type',
    'access-control-expose-headers': '*',
    'access-control-max-age': '600',
    vary: 'origin',
  };
}

function fail(res, status, message, origin) {
  const headers = {'content-type': 'text/plain; charset=utf-8'};
  if (origin) Object.assign(headers, corsHeaders(origin));
  res.writeHead(status, headers);
  res.end(message);
}

/**
 * Resolves the host and hands back both the address and a lookup that returns
 * it, so the request goes to the address that was checked. Resolving twice
 * would leave room for the answer to change in between.
 */
function resolvePinned(hostname, callback) {
  dns.lookup(hostname, {all: false, verbatim: true}, (err, address, family) => {
    if (err) return callback(err);

    callback(null, address, (_host, _options, cb) => cb(null, address, family));
  });
}

function forward(url, req, res, origin, redirectsLeft, body) {
  resolvePinned(url.hostname, (err, address, lookup) => {
    if (err) {
      return fail(res, 502, `cannot resolve ${url.hostname}`, origin);
    }

    if (isLinkLocal(address)) {
      return fail(res, 403, 'link-local addresses are not proxied', origin);
    }

    const headers = {};
    Object.keys(req.headers).forEach((name) => {
      if (!DROP_FROM_REQUEST.includes(name.toLowerCase())) {
        headers[name] = req.headers[name];
      }
    });
    headers.host = url.host;

    const transport = url.protocol === 'https:' ? https : http;
    const upstream = transport.request(
      {
        protocol: url.protocol,
        hostname: url.hostname,
        port: url.port || (url.protocol === 'https:' ? 443 : 80),
        path: url.pathname + url.search,
        method: req.method,
        headers,
        lookup,
        timeout: TIMEOUT,
      },
      (answer) => {
        const location = answer.headers.location;
        const redirecting =
          location && answer.statusCode >= 300 && answer.statusCode < 400;

        if (redirecting && redirectsLeft > 0) {
          let next;
          try {
            next = new URL(location, url);
          } catch {
            return fail(res, 502, 'upstream sent a redirect we cannot read', origin);
          }

          if (next.protocol !== 'http:' && next.protocol !== 'https:') {
            return fail(res, 502, 'upstream redirected somewhere unsupported', origin);
          }

          // the hop is checked like any other, so a redirect cannot be used to
          // reach an address that would have been refused up front
          answer.resume();
          return forward(next, req, res, origin, redirectsLeft - 1, body);
        }

        const out = {};
        Object.keys(answer.headers).forEach((name) => {
          if (!DROP_FROM_RESPONSE.includes(name.toLowerCase())) {
            out[name] = answer.headers[name];
          }
        });
        Object.assign(out, corsHeaders(origin));

        res.writeHead(answer.statusCode, out);
        answer.pipe(res);
      }
    );

    upstream.on('timeout', () => upstream.destroy(new Error('timed out')));
    upstream.on('error', (e) => {
      if (res.headersSent) return res.destroy();
      fail(res, 502, e.message, origin);
    });

    if (body && body.length) upstream.end(body);
    else upstream.end();
  });
}

/**
 * @param origin the one origin allowed to use this, the widget page's own
 */
function createServer({origin}) {
  return http.createServer((req, res) => {
    if (req.headers.origin !== origin) {
      // no origin at all, or somebody else's: nothing to answer
      return fail(res, 403, 'not an allowed origin', null);
    }

    if (!METHODS.includes(req.method)) {
      return fail(res, 405, `${req.method} is not proxied`, origin);
    }

    // a preflight is about this server, so it never reaches upstream
    if (req.method === 'OPTIONS' && req.headers['access-control-request-method']) {
      res.writeHead(204, corsHeaders(origin));
      return res.end();
    }

    const url = parseTarget(req.url);
    if (!url) {
      return fail(res, 400, 'ask for /<url>, http or https', origin);
    }

    // the body is small in practice, and reading it first keeps the retry on a
    // redirect straightforward
    const chunks = [];
    req.on('data', (chunk) => chunks.push(chunk));
    req.on('error', () => fail(res, 400, 'could not read the request', origin));
    req.on('end', () =>
      forward(url, req, res, origin, MAX_REDIRECTS, Buffer.concat(chunks))
    );
  });
}

module.exports = {createServer, parseTarget, isLinkLocal};
