//
//  app.ts
//  Gailan
//
//  Copyright (c) 2026 Kevin Chen.
//  Based on code by Felix Hageloh.
//
//  Released under the terms of the GNU General Public License as published by
//  the Free Software Foundation, either version 3 of the License, or
//  (at your option) any later version. See <http://www.gnu.org/licenses/> for
//  details.
//
'use strict';

const connect = require('connect');
const http = require('http');
const serveStatic = require('serve-static');
const fs = require('fs');
const redux = require('redux');

const MessageBus = require('./MessageBus');
const watchDir = require('./directory_watcher.ts');
const WidgetBundler = require('./WidgetBundler.js');
const Settings = require('./Settings');
const StateServer = require('./StateServer');
const ensureSameHost = require('./ensureSameHost');
const ensureSameOrigin = require('./ensureSameOrigin');
const ensureToken = require('./ensureToken');
const validateTokenCookie = require('./validateTokenCookie');
const disallowIFraming = require('./disallowIFraming');
const CommandServer = require('./command_server.ts');
const serveWidgets = require('./serveWidgets');
const serveClient = require('./serveClient');
const serveCss = require('./serveCss');
const sharedSocket = require('./SharedSocket');
const actions = require('./actions');
const reducer = require('./reducer');
const resolveWidget = require('./resolveWidget');
const widgetConfigFile = require('./widgetConfigFile');
const readWidgetSettings = require('./readWidgetSettings');

const dispatchToRemote = require('./dispatch');
const listenToRemote = require('./listen');

type ServerOptions = {
  loginShell?: boolean;
  shell?: string;
  disableToken?: boolean;
};

type FileEvent = {
  filePath: string;
  rootPath: string;
};

module.exports = function GailanServer(
  port: number,
  widgetPath: string,
  settingsPath: string,
  publicPath: string,
  token: string,
  options: ServerOptions,
  callback?: () => void
) {
  const opts: ServerOptions = options || {};

  // global store for app state
  const store = redux.createStore(reducer, {
    widgets: {},
    settings: {},
    screens: [],
  });

  // listen to remote actions
  listenToRemote((action: any) => {
    store.dispatch(action);
  });

  // follow symlink if widgetDirectory is one
  let widgetDir = widgetPath;
  if (fs.lstatSync(widgetDir).isSymbolicLink()) {
    widgetDir = fs.readlinkSync(widgetDir);
  }
  widgetDir = widgetDir.normalize();

  const bundler = WidgetBundler(widgetDir);
  // TODO: use a stream/generator/promise pattern instead of nested callbacks
  const stopWatchingDir = watchDir(widgetDir, (fileEvent: FileEvent) => {
    if (fileEvent.filePath.replace(fileEvent.rootPath, '') === '/main.css') {
      dispatchToRemote({type: 'MASTER_STYLE_CHANGED'});
      return;
    }
    bundler.push(resolveWidget(fileEvent), (widgetEvent: any) => {
      const action = actions.get(widgetEvent);
      if (action) {
        store.dispatch(action);
        dispatchToRemote(action);
      }
    });
  });

  // load and replay settings
  const settings = Settings(settingsPath);

  Object.entries(settings.load()).forEach(([id, value]) => {
    const action = actions.applyWidgetSettings(id, value);
    store.dispatch(action);
    dispatchToRemote(action);
  });

  store.subscribe(() => {
    const state = store.getState();
    settings.persist(state.settings);

    // a widget's own settings are written beside it, so they travel with the
    // widget rather than living only in this app's support folder
    Object.keys(state.widgets).forEach((id) => {
      const widget = state.widgets[id];
      if (!widget || !widget.filePath) return;

      /* What it falls back to, written the first time so it is there to read and
         edit. This comes before the chosen values because a widget nobody has
         configured has none, and that is when knowing the defaults helps most. */
      widgetConfigFile.writeDefaults(
        widget.filePath,
        readWidgetSettings.defaultsFor(widget.settingsSchema)
      );

      const config = (state.settings[id] || {}).config;
      if (!config) return;
      widgetConfigFile.write(widget.filePath, config);
    });
  });

  // set up the server
  const host = '127.0.0.1';
  let messageBus: any = null;
  const allowedHost = `${host}:${port}`;
  const allowedOrigin = `http://${allowedHost}`;
  const middleware = connect()
    .use(disallowIFraming)
    .use(ensureSameHost(allowedHost))
    .use(ensureSameOrigin(allowedOrigin))
    .use(ensureToken(token, opts.disableToken))
    .use(CommandServer(widgetDir, opts.loginShell, opts.shell))
    .use(StateServer(store))
    .use(serveWidgets(bundler, widgetDir))
    .use(serveStatic(publicPath))
    .use(serveStatic(widgetDir))
    .use(serveCss(widgetDir))
    .use(serveClient(publicPath));

  const server = http.createServer(middleware);
  server.keepAliveTimeout = 35000;
  server.listen(port, host, (err: Error) => {
    try {
      if (err) return server.emit('error', err);
      messageBus = MessageBus({
        server: server,
        verifyClient: (info: any) => {
          const originOkay =
            info.req.headers.host === allowedHost &&
            (info.origin === allowedOrigin || info.origin === 'Gailan');
          if (opts.disableToken) return originOkay;
          return (
            originOkay && validateTokenCookie(token, info.req.headers.cookie)
          );
        },
      });
      sharedSocket.open(`ws://${host}:${port}`, token);
      if (callback) callback();
    } catch (e) {
      server.emit('error', e);
    }
  });

  // api
  return {
    close: (cb?: () => void) => {
      stopWatchingDir();
      bundler.close();
      server.close();
      sharedSocket.close();
      messageBus.close(cb);
    },

    on: (ev: string, handler: (...args: any[]) => void) => {
      server.on(ev, handler);
    },
  };
};
