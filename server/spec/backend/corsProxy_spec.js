//
//  corsProxy_spec.js
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
const http = require('http');

const corsProxy = require('../../src/corsProxy.js');

const ORIGIN = 'http://127.0.0.1:41000';

// an upstream to be proxied, and the proxy in front of it, both on ports the
// operating system picks so a run never collides with anything
function withServers(handler, run) {
  const upstream = http.createServer(handler);

  upstream.listen(0, '127.0.0.1', () => {
    const proxy = corsProxy.createServer({origin: ORIGIN});

    proxy.listen(0, '127.0.0.1', () => {
      run(
        {
          upstreamPort: upstream.address().port,
          proxyPort: proxy.address().port,
        },
        () => {
          proxy.close();
          upstream.close();
        }
      );
    });
  });
}

function request({port, path, headers = {}, method = 'GET', body}, done) {
  const req = http.request(
    {hostname: '127.0.0.1', port, path, method, headers},
    (res) => {
      const chunks = [];
      res.on('data', (c) => chunks.push(c));
      res.on('end', () =>
        done(null, {
          status: res.statusCode,
          headers: res.headers,
          body: Buffer.concat(chunks).toString(),
        })
      );
    }
  );
  req.on('error', done);
  if (body) req.write(body);
  req.end();
}

// MARK: - reading the target out of the path

test('the target is whatever follows the slash', (t) => {
  const url = corsProxy.parseTarget('/https://example.com/a?b=c');
  t.equal(url.protocol, 'https:');
  t.equal(url.hostname, 'example.com');
  t.equal(url.pathname, '/a');
  t.equal(url.search, '?b=c');
  t.end();
});

test('a bare host is assumed to be http, as the old proxy assumed', (t) => {
  const url = corsProxy.parseTarget('/example.com/thing');
  t.equal(url.protocol, 'http:');
  t.equal(url.hostname, 'example.com');
  t.end();
});

test('an empty path is not a target', (t) => {
  t.equal(corsProxy.parseTarget('/'), null);
  t.end();
});

test('a scheme we do not proxy is refused', (t) => {
  // and not quietly turned into a request for a host named "file"
  t.equal(corsProxy.parseTarget('/file:///etc/passwd'), null, 'file');
  t.equal(corsProxy.parseTarget('/ftp://example.com/x'), null, 'ftp');
  t.equal(corsProxy.parseTarget('/javascript:alert(1)'), null, 'javascript');
  t.equal(corsProxy.parseTarget('/data:text/html,hi'), null, 'data');
  t.end();
});

test('a bare host keeps its port, since that colon is not a scheme', (t) => {
  const url = corsProxy.parseTarget('/example.com:8080/x');
  t.equal(url.protocol, 'http:');
  t.equal(url.hostname, 'example.com');
  t.equal(url.port, '8080');
  t.end();
});

test('something that is not a url at all is refused', (t) => {
  t.equal(corsProxy.parseTarget('/http://'), null);
  t.end();
});

// MARK: - which addresses are refused

test('link-local addresses are recognised', (t) => {
  t.ok(corsProxy.isLinkLocal('169.254.169.254'), 'the metadata address');
  t.ok(corsProxy.isLinkLocal('169.254.0.1'));
  t.ok(corsProxy.isLinkLocal('::ffff:169.254.169.254'));
  t.ok(corsProxy.isLinkLocal('fe80::1'));
  t.ok(corsProxy.isLinkLocal('FE80::1'), 'case does not matter');
  t.ok(corsProxy.isLinkLocal('feb0::1'));
  t.end();
});

test('ordinary addresses are not', (t) => {
  t.notOk(corsProxy.isLinkLocal('93.184.216.34'));
  t.notOk(corsProxy.isLinkLocal('127.0.0.1'), 'loopback stays reachable');
  t.notOk(corsProxy.isLinkLocal('192.168.1.1'), 'this network stays reachable');
  t.notOk(corsProxy.isLinkLocal('2606:2800::1'));
  t.notOk(corsProxy.isLinkLocal('169.253.0.1'), 'next door is not link-local');
  t.end();
});

// MARK: - the origin is the boundary

test('a request without an origin is refused', (t) => {
  withServers(
    (_req, res) => res.end('should not be reached'),
    (ports, stop) => {
      request({port: ports.proxyPort, path: '/http://127.0.0.1/'}, (err, res) => {
        t.error(err);
        t.equal(res.status, 403);
        t.equal(res.body, 'not an allowed origin');
        t.notOk(res.headers['access-control-allow-origin'], 'and no cors headers');
        stop();
        t.end();
      });
    }
  );
});

test('a request from another origin is refused', (t) => {
  withServers(
    (_req, res) => res.end('should not be reached'),
    (ports, stop) => {
      request(
        {
          port: ports.proxyPort,
          path: '/http://127.0.0.1/',
          headers: {origin: 'https://somewhere.else'},
        },
        (err, res) => {
          t.error(err);
          t.equal(res.status, 403);
          stop();
          t.end();
        }
      );
    }
  );
});

// MARK: - proxying

test('a response comes back with the origin allowed to read it', (t) => {
  withServers(
    (req, res) => {
      res.writeHead(200, {'content-type': 'text/plain'});
      res.end(`hello from ${req.url}`);
    },
    (ports, stop) => {
      request(
        {
          port: ports.proxyPort,
          path: `/http://127.0.0.1:${ports.upstreamPort}/greet`,
          headers: {origin: ORIGIN},
        },
        (err, res) => {
          t.error(err);
          t.equal(res.status, 200);
          t.equal(res.body, 'hello from /greet');
          t.equal(res.headers['access-control-allow-origin'], ORIGIN);
          t.equal(res.headers['content-type'], 'text/plain');
          t.equal(res.headers.vary, 'origin');
          stop();
          t.end();
        }
      );
    }
  );
});

test('the query string travels with it', (t) => {
  withServers(
    (req, res) => res.end(req.url),
    (ports, stop) => {
      request(
        {
          port: ports.proxyPort,
          path: `/http://127.0.0.1:${ports.upstreamPort}/x?a=1&b=2`,
          headers: {origin: ORIGIN},
        },
        (err, res) => {
          t.error(err);
          t.equal(res.body, '/x?a=1&b=2');
          stop();
          t.end();
        }
      );
    }
  );
});

test('a body is passed through on a post', (t) => {
  withServers(
    (req, res) => {
      const chunks = [];
      req.on('data', (c) => chunks.push(c));
      req.on('end', () => res.end(`got ${Buffer.concat(chunks)}`));
    },
    (ports, stop) => {
      request(
        {
          port: ports.proxyPort,
          path: `/http://127.0.0.1:${ports.upstreamPort}/post`,
          method: 'POST',
          headers: {origin: ORIGIN, 'content-type': 'text/plain'},
          body: 'a parcel',
        },
        (err, res) => {
          t.error(err);
          t.equal(res.body, 'got a parcel');
          stop();
          t.end();
        }
      );
    }
  );
});

test('cookies do not travel in either direction', (t) => {
  withServers(
    (req, res) => {
      res.writeHead(200, {'set-cookie': 'session=secret'});
      res.end(`cookie seen: ${req.headers.cookie || 'none'}`);
    },
    (ports, stop) => {
      request(
        {
          port: ports.proxyPort,
          path: `/http://127.0.0.1:${ports.upstreamPort}/`,
          headers: {origin: ORIGIN, cookie: 'session=mine'},
        },
        (err, res) => {
          t.error(err);
          t.equal(res.body, 'cookie seen: none', 'not sent upstream');
          t.notOk(res.headers['set-cookie'], 'not handed back either');
          stop();
          t.end();
        }
      );
    }
  );
});

test('the host header names the upstream, not the proxy', (t) => {
  withServers(
    (req, res) => res.end(`host: ${req.headers.host}`),
    (ports, stop) => {
      request(
        {
          port: ports.proxyPort,
          path: `/http://127.0.0.1:${ports.upstreamPort}/`,
          headers: {origin: ORIGIN},
        },
        (err, res) => {
          t.error(err);
          t.equal(res.body, `host: 127.0.0.1:${ports.upstreamPort}`);
          stop();
          t.end();
        }
      );
    }
  );
});

test('an upstream error status is reported as it stands', (t) => {
  withServers(
    (_req, res) => {
      res.writeHead(404);
      res.end('nope');
    },
    (ports, stop) => {
      request(
        {
          port: ports.proxyPort,
          path: `/http://127.0.0.1:${ports.upstreamPort}/missing`,
          headers: {origin: ORIGIN},
        },
        (err, res) => {
          t.error(err);
          t.equal(res.status, 404);
          t.equal(res.body, 'nope');
          t.equal(res.headers['access-control-allow-origin'], ORIGIN);
          stop();
          t.end();
        }
      );
    }
  );
});

// MARK: - redirects

test('a redirect is followed', (t) => {
  withServers(
    (req, res) => {
      if (req.url === '/start') {
        res.writeHead(302, {location: '/finish'});
        return res.end();
      }
      res.end('arrived');
    },
    (ports, stop) => {
      request(
        {
          port: ports.proxyPort,
          path: `/http://127.0.0.1:${ports.upstreamPort}/start`,
          headers: {origin: ORIGIN},
        },
        (err, res) => {
          t.error(err);
          t.equal(res.status, 200);
          t.equal(res.body, 'arrived');
          stop();
          t.end();
        }
      );
    }
  );
});

test('a redirect loop stops rather than going forever', (t) => {
  withServers(
    (_req, res) => {
      res.writeHead(302, {location: '/round'});
      res.end();
    },
    (ports, stop) => {
      request(
        {
          port: ports.proxyPort,
          path: `/http://127.0.0.1:${ports.upstreamPort}/round`,
          headers: {origin: ORIGIN},
        },
        (err, res) => {
          t.error(err);
          t.equal(res.status, 302, 'the last hop is handed back as it came');
          stop();
          t.end();
        }
      );
    }
  );
});

test('a redirect somewhere unsupported is refused', (t) => {
  withServers(
    (_req, res) => {
      res.writeHead(302, {location: 'ftp://example.com/x'});
      res.end();
    },
    (ports, stop) => {
      request(
        {
          port: ports.proxyPort,
          path: `/http://127.0.0.1:${ports.upstreamPort}/`,
          headers: {origin: ORIGIN},
        },
        (err, res) => {
          t.error(err);
          t.equal(res.status, 502);
          t.match(res.body, /unsupported/);
          stop();
          t.end();
        }
      );
    }
  );
});

test('an unreadable redirect is refused', (t) => {
  withServers(
    (_req, res) => {
      res.writeHead(302, {location: 'http://['});
      res.end();
    },
    (ports, stop) => {
      request(
        {
          port: ports.proxyPort,
          path: `/http://127.0.0.1:${ports.upstreamPort}/`,
          headers: {origin: ORIGIN},
        },
        (err, res) => {
          t.error(err);
          t.equal(res.status, 502);
          stop();
          t.end();
        }
      );
    }
  );
});

// MARK: - the rest of the surface

test('a preflight is answered without troubling upstream', (t) => {
  let reached = false;
  withServers(
    (_req, res) => {
      reached = true;
      res.end();
    },
    (ports, stop) => {
      request(
        {
          port: ports.proxyPort,
          path: `/http://127.0.0.1:${ports.upstreamPort}/`,
          method: 'OPTIONS',
          headers: {origin: ORIGIN, 'access-control-request-method': 'GET'},
        },
        (err, res) => {
          t.error(err);
          t.equal(res.status, 204);
          t.equal(res.headers['access-control-allow-origin'], ORIGIN);
          t.ok(res.headers['access-control-allow-methods'].includes('POST'));
          t.notOk(reached, 'upstream was never asked');
          stop();
          t.end();
        }
      );
    }
  );
});

test('a method we do not proxy is refused', (t) => {
  withServers(
    (_req, res) => res.end(),
    (ports, stop) => {
      request(
        {
          port: ports.proxyPort,
          path: `/http://127.0.0.1:${ports.upstreamPort}/`,
          method: 'TRACE',
          headers: {origin: ORIGIN},
        },
        (err, res) => {
          t.error(err);
          t.equal(res.status, 405);
          stop();
          t.end();
        }
      );
    }
  );
});

test('asking for nothing in particular is a bad request', (t) => {
  withServers(
    (_req, res) => res.end(),
    (ports, stop) => {
      request(
        {port: ports.proxyPort, path: '/', headers: {origin: ORIGIN}},
        (err, res) => {
          t.error(err);
          t.equal(res.status, 400);
          stop();
          t.end();
        }
      );
    }
  );
});

// Every other test here names 127.0.0.1, and node skips the lookup for an address
// it can already read, so none of them went through resolution. A hostname does,
// which is how the wrong callback shape got as far as the running app.
test('a target that has to be resolved is proxied', (t) => {
  const upstream = http.createServer((req, res) => res.end(`resolved ${req.url}`));

  // no host given, so it answers on whichever family localhost resolves to
  upstream.listen(0, () => {
    const port = upstream.address().port;
    const proxy = corsProxy.createServer({origin: ORIGIN});

    proxy.listen(0, '127.0.0.1', () => {
      request(
        {
          port: proxy.address().port,
          path: `/http://localhost:${port}/named`,
          headers: {origin: ORIGIN},
        },
        (err, res) => {
          t.error(err);
          t.equal(res.status, 200);
          t.equal(res.body, 'resolved /named');
          proxy.close();
          upstream.close();
          t.end();
        }
      );
    });
  });
});

test('a host that does not resolve is reported', (t) => {
  withServers(
    (_req, res) => res.end(),
    (ports, stop) => {
      request(
        {
          port: ports.proxyPort,
          path: '/http://nothing.invalid/',
          headers: {origin: ORIGIN},
        },
        (err, res) => {
          t.error(err);
          t.equal(res.status, 502);
          t.match(res.body, /cannot resolve/);
          stop();
          t.end();
        }
      );
    }
  );
});

test('a link-local target is refused before it is contacted', (t) => {
  withServers(
    (_req, res) => res.end(),
    (ports, stop) => {
      request(
        {
          port: ports.proxyPort,
          path: '/http://169.254.169.254/latest/meta-data/',
          headers: {origin: ORIGIN},
        },
        (err, res) => {
          t.error(err);
          t.equal(res.status, 403);
          t.match(res.body, /link-local/);
          stop();
          t.end();
        }
      );
    }
  );
});

test('an upstream that refuses the connection is reported', (t) => {
  withServers(
    (_req, res) => res.end(),
    (ports, stop) => {
      // the upstream's own port, closed first so nothing is listening
      const dead = ports.upstreamPort;
      stop();
      const proxy = corsProxy.createServer({origin: ORIGIN});
      proxy.listen(0, '127.0.0.1', () => {
        request(
          {
            port: proxy.address().port,
            path: `/http://127.0.0.1:${dead}/`,
            headers: {origin: ORIGIN},
          },
          (err, res) => {
            t.error(err);
            t.equal(res.status, 502);
            proxy.close();
            t.end();
          }
        );
      });
    }
  );
});
