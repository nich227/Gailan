//
//  app_spec.js
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
const testPort = require('../helpers/testPort');
const GailanServer = require('../../src/app.ts');

// Everything else tests one piece. This starts the whole server the way the app
// does, with a real widget on disk, and takes it down again.
const TOKEN = 'a-token-for-the-spec';

function scratch() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'gailan-app-'));
  const widgets = path.join(root, 'widgets');
  fs.mkdirSync(widgets);
  fs.writeFileSync(
    path.join(widgets, 'spec-widget.js'),
    'command: "echo hi",\nrefreshFrequency: 5000,\nrender: (output) => output\n'
  );
  return {root: root, widgets: widgets, settings: path.join(root, 'settings')};
}

function get(port, urlPath, headers, callback) {
  const request = http.get(
    {
      port: port,
      path: urlPath,
      host: '127.0.0.1',
      headers: Object.assign({host: '127.0.0.1:' + port}, headers),
      agent: false,
    },
    (res) => {
      let body = '';
      res.on('data', (chunk) => {
        body += chunk;
      });
      res.on('end', () => callback(res, body));
    }
  );
  request.on('error', () => callback({statusCode: 0}, ''));
}

test('serving the widget state', (t) => {
  const dirs = scratch();
  const port = testPort();

  const server = GailanServer(
    port,
    dirs.widgets,
    dirs.settings,
    path.join(__dirname, '..', '..', 'release', 'public'),
    TOKEN,
    {},
    () => {
      get(port, '/state/?token=' + TOKEN, {}, (res, body) => {
        t.equal(res.statusCode, 200, 'the state endpoint answers');

        let state = null;
        try {
          state = JSON.parse(body);
        } catch (e) {
          t.fail('the state is not JSON: ' + body.slice(0, 80));
        }

        if (state) {
          t.ok(state.widgets, 'with a widget collection');
          t.ok(state.settings, 'and the settings');
        }

        server.close(() => {
          fs.rmSync(dirs.root, {recursive: true, force: true});
          t.end();
        });
      });
    }
  );

  server.on('error', (err) => {
    t.fail('the server errored: ' + err.message);
    t.end();
  });
});

test('turning away a request without the token', (t) => {
  const dirs = scratch();
  const port = testPort();

  const server = GailanServer(
    port,
    dirs.widgets,
    dirs.settings,
    path.join(__dirname, '..', '..', 'release', 'public'),
    TOKEN,
    {},
    () => {
      get(port, '/state/', {}, (res) => {
        t.equal(res.statusCode, 403, 'no token, no state');

        server.close(() => {
          fs.rmSync(dirs.root, {recursive: true, force: true});
          t.end();
        });
      });
    }
  );
});

test('running with the token turned off', (t) => {
  const dirs = scratch();
  const port = testPort();

  const server = GailanServer(
    port,
    dirs.widgets,
    dirs.settings,
    path.join(__dirname, '..', '..', 'release', 'public'),
    TOKEN,
    {disableToken: true},
    () => {
      get(port, '/state/', {}, (res) => {
        t.equal(res.statusCode, 200, 'the state is open, which is the point');

        server.close(() => {
          fs.rmSync(dirs.root, {recursive: true, force: true});
          t.end();
        });
      });
    }
  );
});

test('replaying settings saved from a previous run', (t) => {
  const dirs = scratch();
  const settingsDir = path.join(dirs.root, 'settings');
  fs.mkdirSync(settingsDir);
  fs.writeFileSync(
    path.join(settingsDir, 'WidgetSettings.json'),
    JSON.stringify({'spec-widget': {hidden: true, showOnAllScreens: true}})
  );

  const port = testPort();
  const server = GailanServer(
    port,
    dirs.widgets,
    settingsDir,
    path.join(__dirname, '..', '..', 'release', 'public'),
    TOKEN,
    {loginShell: false, shell: 'zsh'},
    () => {
      get(port, '/state/?token=' + TOKEN, {}, (res, body) => {
        const state = JSON.parse(body);
        t.deepEqual(
          state.settings['spec-widget'],
          {hidden: true, showOnAllScreens: true},
          'what was saved last time is in the state this time'
        );

        server.close(() => {
          fs.rmSync(dirs.root, {recursive: true, force: true});
          t.end();
        });
      });
    }
  );
});

test('a stylesheet change in the widget folder', (t) => {
  const dirs = scratch();
  const port = testPort();

  const server = GailanServer(
    port,
    dirs.widgets,
    path.join(dirs.root, 'settings'),
    path.join(__dirname, '..', '..', 'release', 'public'),
    TOKEN,
    {},
    () => {
      // main.css is not a widget: it tells the page to reload its styles
      fs.writeFileSync(path.join(dirs.widgets, 'main.css'), 'body { color: red }');

      setTimeout(() => {
        get(port, '/main.css?token=' + TOKEN, {}, (res) => {
          t.equal(res.statusCode, 200, 'and it is served');
          server.close(() => {
            fs.rmSync(dirs.root, {recursive: true, force: true});
            t.end();
          });
        });
      }, 500);
    }
  );
});

test('following a symlinked widget directory', (t) => {
  const dirs = scratch();
  const link = path.join(dirs.root, 'link-to-widgets');
  fs.symlinkSync(dirs.widgets, link);
  const port = testPort();

  const server = GailanServer(
    port,
    link,
    dirs.settings,
    path.join(__dirname, '..', '..', 'release', 'public'),
    TOKEN,
    {},
    () => {
      get(port, '/state/?token=' + TOKEN, {}, (res) => {
        t.equal(res.statusCode, 200, 'the link is followed to the real folder');

        server.close(() => {
          fs.rmSync(dirs.root, {recursive: true, force: true});
          t.end();
        });
      });
    }
  );
});
