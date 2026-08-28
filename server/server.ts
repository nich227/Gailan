//
//  server.ts
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

const parseArgs = require('minimist');
const GailanServer = require('./src/app.ts');
const corsProxy = require('./src/corsProxy.js');
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');

type ServerOptions = {
  loginShell?: boolean;
  shell?: string;
  disableToken?: boolean;
};

// The token arrives on stdin so it never shows in the process list. Reading is
// guarded by isTTY so `npm start` in a terminal does not hang waiting for input
// the way the upstream patch would.
function readToken(): string | null {
  if (process.stdin.isTTY) return null;
  try {
    const raw = fs.readFileSync(0, 'utf-8').trim();
    if (raw.length > 0) return raw;
  } catch (e) {
    return null;
  }
  return null;
}

function handleError(err: Error | string): never {
  console.log(err instanceof Error ? err.message : err);
  throw err;
}

try {
  const args = parseArgs(process.argv.slice(2));
  const port: number = Number(args.p ?? args.port ?? 41416);
  const settingsPath: string = path.resolve(
    __dirname,
    args.s ?? args.settings ?? './settings'
  );
  const publicPath: string = path.resolve(__dirname, './public');
  const widgetPath: string = path.resolve(
    __dirname,
    args.d ?? args.dir ?? './widgets'
  );
  const token: string = readToken() ?? crypto.randomUUID();
  const options: ServerOptions = {
    loginShell: args['login-shell'],
    shell: args['shell'],
    disableToken: args['disable-token'],
  };

  const server = GailanServer(
    port,
    widgetPath,
    settingsPath,
    publicPath,
    token,
    options,
    () => console.log('server started on port', port)
  );
  server.on('close', handleError);
  server.on('error', handleError);

  const corsHost = '127.0.0.1';
  const corsPort = port + 1;
  corsProxy
    .createServer({origin: 'http://127.0.0.1:' + port})
    .listen(corsPort, corsHost, () =>
      console.log('CORS proxy on port', corsPort)
    );
} catch (e) {
  handleError(e as Error);
}
