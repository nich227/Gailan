//
//  esbuildWidget.js
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

const esbuild = require('esbuild');
const {EventEmitter} = require('events');
const path = require('path');
const fs = require('fs');
const widgetify = require('./widgetify');

// the registry a widget bundle publishes itself into. the client reads it
// after the script tag loads.
const REGISTRY = 'globalThis.__gailanWidgets';

// gailan and uebersicht are already in the client bundle, which exposes
// browserify's require globally. widgets borrow them from there instead of
// bundling a second react.
function hostModules() {
  return {
    name: 'host-modules',
    setup(build) {
      build.onResolve({filter: /^(gailan|uebersicht)$/}, (args) => ({
        path: args.path,
        namespace: 'gailan-host',
      }));
      // reaching it through globalThis keeps esbuild from treating this as an
      // import to bundle, and works wherever the bundle is evaluated
      build.onLoad({filter: /.*/, namespace: 'gailan-host'}, (args) => ({
        contents: `module.exports = globalThis.require(${JSON.stringify(
          args.path
        )});`,
        loader: 'js',
      }));
    },
  };
}

// esbuild hands back resolved real paths, and on macOS /var is a symlink to
// /private/var, so comparing the strings esbuild gives us to the path we were
// handed needs both sides resolved. Gailan follows a symlinked widget folder on
// purpose, so this is not just a temp directory problem.
function realPath(filePath) {
  try {
    return fs.realpathSync(filePath);
  } catch (err) {
    return path.resolve(filePath);
  }
}

// Emotion's own babel plugin, for the labels that make a generated class name
// say which component it came from: css-1a2b3c-Window rather than css-1a2b3c.
// Widgets import styled and css from "gailan", so the plugin has to be told
// those are emotion's, or it leaves them alone.
//
// It costs about 55ms once, mostly loading babel, and 6ms per rebuild. Emotion's
// per-style source maps are left off: they embed a copy of the file's map into
// every styled call, which took the starter widget from 30KB to 302KB.
const EMOTION_IMPORTS = {
  styled: {canonicalImport: ['@emotion/styled', 'default']},
  css: {canonicalImport: ['@emotion/css', 'css']},
};

function emotionLabels() {
  return {
    name: 'emotion-labels',
    setup(build) {
      // required lazily so a classic widget never pays for babel
      let babel = null;
      let plugin = null;

      build.onLoad({filter: /\.(jsx|tsx)$/}, async (args) => {
        if (!babel) {
          babel = require('@babel/core');
          plugin = [
            require('@emotion/babel-plugin'),
            {
              autoLabel: 'always',
              labelFormat: '[local]',
              sourceMap: false,
              importMap: {
                gailan: EMOTION_IMPORTS,
                uebersicht: EMOTION_IMPORTS,
              },
            },
          ];
        }

        const source = fs.readFileSync(args.path, 'utf8');
        try {
          const result = await babel.transformAsync(source, {
            filename: args.path,
            babelrc: false,
            configFile: false,
            plugins: [plugin],
            // babel only parses here; esbuild still does the compiling, so the
            // jsx and the types are printed back out untouched
            parserOpts: {plugins: ['jsx', 'typescript']},
          });
          return {
            contents: result.code,
            loader: path.extname(args.path).slice(1),
          };
        } catch (err) {
          return {
            errors: [
              {
                text: err.message.split('\n')[0],
                location: err.loc
                  ? {
                      file: args.path,
                      line: err.loc.line,
                      column: err.loc.column,
                      lineText: source.split('\n')[err.loc.line - 1] || '',
                    }
                  : null,
              },
            ],
          };
        }
      });
    },
  };
}

// classic widgets: a bare object literal whose style is stylus and whose
// refreshFrequency may be "10s". widgetify rewrites all that.
function classicWidget(id, entry) {
  const entryPath = realPath(entry);
  return {
    name: 'classic-widget',
    setup(build) {
      // a plain .js widget is a bare object literal, so it needs wrapping
      // before it can be parsed as an expression
      build.onLoad({filter: /\.js$/}, (args) => {
        if (realPath(args.path) !== entryPath) return null;
        const source = fs.readFileSync(args.path, 'utf8');
        try {
          // the wrapper adds no lines, so the parser's positions still point
          // at the widget's own source
          return {contents: rewrite(`({${source}})`, args.path), loader: 'js'};
        } catch (err) {
          return {
            errors: [
              {
                text: err.description || err.message,
                location: err.lineNumber
                  ? {
                      file: args.path,
                      line: err.lineNumber,
                      column: err.column ? err.column - 1 : 0,
                      lineText: source.split('\n')[err.lineNumber - 1] || '',
                    }
                  : null,
              },
            ],
          };
        }
      });

      // only the widget itself is an object literal; its imports are modules
      function rewrite(source, filePath) {
        if (realPath(filePath) !== entryPath) return source;
        return widgetify.transform(source, id);
      }
    },
  };
}

// esbuild reports failures in its own shape. the widget error view wants what
// browserify used to hand it: a message, a position, and a few lines of source
// to point at.
function normalizeError(err, filePath) {
  const first = err.errors && err.errors[0];
  if (!first) return err;

  const location = first.location || {};
  const error = new Error(
    first.pluginName ? first.text : `${first.text} in ${filePath}`
  );
  error.line = location.line;
  error.column = location.column;
  error.filename = location.file || filePath;
  error.annotated = frame(filePath, location.line);
  return error;
}

function frame(filePath, line) {
  if (!line) return '';
  let source;
  try {
    source = fs.readFileSync(filePath, 'utf8').split('\n');
  } catch (readError) {
    return '';
  }

  const from = Math.max(0, line - 3);
  return source
    .slice(from, line + 2)
    .map((text, index) => {
      const number = from + index + 1;
      return `${number === line ? '>' : ' '} ${number} | ${text}`;
    })
    .join('\n');
}

module.exports = function esbuildWidget(id, filePath) {
  const isTyped = /\.(tsx|ts)$/.test(filePath);
  const isJsx = /\.(jsx|tsx)$/.test(filePath) || isTyped;
  const isClassic = !isJsx;

  const emitter = new EventEmitter();
  let context = null;
  let closed = false;

  const options = {
    entryPoints: [filePath],
    bundle: true,
    write: false,
    format: 'iife',
    globalName: '__gailanWidget',
    // widget code is published where the client can pick it up by id
    footer: {
      js:
        `${REGISTRY}=${REGISTRY}||{};` +
        `${REGISTRY}[${JSON.stringify(id)}]=` +
        '__gailanWidget&&__gailanWidget.default!==undefined&&' +
        'Object.keys(__gailanWidget).length===1' +
        '?__gailanWidget.default:__gailanWidget;',
    },
    // safari 16.6 is the oldest webkit we run on
    target: ['safari16.6'],
    platform: 'browser',
    // widgets say <div/> and mean html('div'), the factory the client exposes
    jsx: 'transform',
    jsxFactory: 'html',
    loader: {'.js': 'js', '.jsx': 'jsx', '.ts': 'ts', '.tsx': 'tsx'},
    sourcemap: isJsx ? 'inline' : false,
    logLevel: 'silent',
    plugins: isClassic
      ? [hostModules(), classicWidget(id, filePath)]
      : [hostModules(), emotionLabels()],
  };

  const api = {
    on: emitter.on.bind(emitter),
    once: emitter.once.bind(emitter),
    removeListener: emitter.removeListener.bind(emitter),
  };

  api.bundle = function bundle(callback) {
    build()
      .then((source) => callback(null, source))
      .catch((err) => callback(normalizeError(err, filePath)));
  };

  api.close = function close() {
    closed = true;
    if (context) {
      context.dispose();
      context = null;
    }
  };

  // rebuilds we ask for are not news. only the watcher's are, otherwise
  // WidgetBundler rebuilding on update would trigger another update forever.
  let explicit = 0;
  let watching = false;

  async function build() {
    if (!context) {
      context = await esbuild.context({
        ...options,
        plugins: options.plugins.concat([
          {
            name: 'notify',
            setup(build) {
              build.onEnd(() => {
                if (explicit > 0 || !watching || closed) return;
                emitter.emit('update');
              });
            },
          },
        ]),
      });
    }

    explicit += 1;
    let result;
    try {
      result = await context.rebuild();
    } finally {
      explicit -= 1;
    }

    if (!watching && !closed) {
      // started after the first build so its initial pass is not an update
      await context.watch();
      watching = true;
    }

    return Buffer.from(result.outputFiles[0].text, 'utf8');
  }

  return api;
};
