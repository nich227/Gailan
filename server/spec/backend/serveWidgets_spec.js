//
//  serveWidgets_spec.js
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
const connect = require('connect');
const serveWidgets = require('../../src/serveWidgets');
const esbuildWidget = require('../../src/esbuildWidget');

// The middleware hands the page a widget's bundle, and when the page reports an
// error position it maps that back to a few lines of the widget's own source.
function fakeBundler(bundles) {
  return {
    get: (id) => bundles[id],
  };
}

function serve(bundler, widgetDir, urlPath, callback) {
  const server = connect()
    .use(serveWidgets(bundler, widgetDir))
    .use((req, res) => {
      res.writeHead(418);
      res.end('fell through');
    })
    .listen(0, () => {
      http.get(
        {port: server.address().port, path: urlPath, agent: false},
        (res) => {
          let body = '';
          res.on('data', (chunk) => {
            body += chunk;
          });
          res.on('end', () => {
            server.close(() => callback(res, body));
          });
        }
      );
    });
}

test('serving a widget bundle', (t) => {
  serve(
    fakeBundler({'a-widget': 'the bundle'}),
    '/widgets',
    '/widgets/a-widget',
    (res, body) => {
      t.equal(res.statusCode, 200, 'it answers');
      t.equal(body, 'the bundle', 'with the widget source');
      t.end();
    }
  );
});

test('asking for a widget that is not bundled', (t) => {
  serve(fakeBundler({}), '/widgets', '/widgets/missing', (res) => {
    t.equal(res.statusCode, 404, 'reports it as missing');
    t.end();
  });
});

test('a request for something else entirely', (t) => {
  serve(fakeBundler({}), '/widgets', '/not-a-widget', (res, body) => {
    t.equal(res.statusCode, 418, 'passes to the next middleware');
    t.equal(body, 'fell through', 'untouched');
    t.end();
  });
});

test('mapping an error position back to widget source', (t) => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'gailan-serve-'));
  const file = path.join(dir, 'mapped.jsx');
  fs.writeFileSync(
    file,
    [
      'export const command = "echo one";',
      'export const refreshFrequency = 1000;',
      'export const render = ({output}) => {',
      '  return <div>{output}</div>;',
      '};',
    ].join('\n') + '\n'
  );

  const bundle = esbuildWidget('mapped', file);
  bundle.bundle((err, source) => {
    bundle.close();
    t.error(err, 'the widget bundles');

    // a jsx widget carries an inline source map, which is what makes this work
    serve(
      fakeBundler({mapped: String(source)}),
      dir,
      '/widgets/mapped?line=1&column=1',
      (res, body) => {
        t.equal(res.statusCode, 200, 'it answers');

        let report = null;
        try {
          report = JSON.parse(body);
        } catch (e) {
          t.fail('not JSON: ' + body.slice(0, 60));
        }

        if (report) {
          t.ok(Array.isArray(report.lines), 'with source lines');
          t.ok(report.lines.length > 0, 'and there are some');
          t.equal(report.path, 'mapped.jsx', 'named relative to the widget dir');
        }

        fs.rmSync(dir, {recursive: true, force: true});
        t.end();
      }
    );
  });
});

test('asking for a position in a bundle with no source map', (t) => {
  serve(
    fakeBundler({plain: 'var x = 1;\n'}),
    '/widgets',
    '/widgets/plain?line=1&column=0',
    (res, body) => {
      t.equal(res.statusCode, 404, 'there is nothing to map against');
      t.ok(body.indexOf('sourcemap') > -1, 'and it says so');
      t.end();
    }
  );
});

test('asking for a position the map does not cover', (t) => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'gailan-serve-'));
  const file = path.join(dir, 'short.jsx');
  fs.writeFileSync(file, 'export const render = () => <div />;\n');

  const bundle = esbuildWidget('short', file);
  bundle.bundle((err, source) => {
    bundle.close();

    serve(
      fakeBundler({short: String(source)}),
      dir,
      '/widgets/short?line=99999&column=0',
      (res, body) => {
        t.equal(res.statusCode, 404, 'reports no match');
        t.ok(body.indexOf('no match found') > -1, 'saying which position');
        fs.rmSync(dir, {recursive: true, force: true});
        t.end();
      }
    );
  });
});
