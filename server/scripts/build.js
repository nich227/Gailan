//
//  build.js
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

// Builds the two bundles the app ships: the client that runs in the web view
// and the server that runs under the bundled node. browserify used to do this
// with coffeeify, babelify and terser in a pipe.
const esbuild = require('esbuild');
const path = require('path');

const root = path.join(__dirname, '..');

// the oldest webkit we support, which is what macOS 13.5 ships
const BROWSER_TARGET = 'safari16.6';
const NODE_TARGET = 'node24';

async function buildClient() {
  const result = await esbuild.build({
    entryPoints: [path.join(root, 'client.ts')],
    outfile: path.join(root, 'release/public/client.js'),
    bundle: true,
    minify: true,
    format: 'iife',
    platform: 'browser',
    target: [BROWSER_TARGET],
    // ws is a node module the shared socket only uses on the server side
    alias: {ws: path.join(__dirname, 'stubs/empty.js')},
    // widgets say <div/> and mean html('div'), the factory the client exposes
    jsx: 'transform',
    jsxFactory: 'html',
    logLevel: 'warning',
    metafile: true,
  });

  report('client.js', result);
}

async function buildServer() {
  const result = await esbuild.build({
    entryPoints: [path.join(root, 'server.ts')],
    outfile: path.join(root, 'release/server.js'),
    bundle: true,
    format: 'cjs',
    platform: 'node',
    target: [NODE_TARGET],
    // node_modules stay on disk and are required at run time, the way
    // browserify's --no-bundle-external did it
    packages: 'external',
    logLevel: 'warning',
    metafile: true,
  });

  report('server.js', result);
}

function report(name, result) {
  const output = Object.values(result.metafile.outputs).find((o) => o.entryPoint);
  const bytes = output ? output.bytes : 0;
  console.log(`${name}: ${(bytes / 1024).toFixed(0)} KB`);
}

(async () => {
  try {
    await Promise.all([buildClient(), buildServer()]);
  } catch (err) {
    process.exit(1);
  }
})();
