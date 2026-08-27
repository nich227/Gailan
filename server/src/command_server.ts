//
//  command_server.ts
//  Gailan
//
//  middleware to serve the results of shell commands. Listens to POST /run/
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

const {spawn} = require('child_process');

type Request = {
  method: string;
  url: string;
  on: (event: string, handler: (chunk?: Buffer) => void) => void;
};

type Response = {
  writeHead: (status: number) => void;
  write: (chunk: Buffer | string) => void;
  end: () => void;
};

module.exports = function commandServer(
  workingDir: string,
  useLoginShell?: boolean,
  shellName?: string
) {
  const args = useLoginShell ? ['-l'] : [];
  const shellCommand = shellName ?? 'zsh';

  // the Connect middleware
  return function (req: Request, res: Response, next: () => void): void {
    if (req.method !== 'POST' || req.url !== '/run/') return next();

    let command = '';
    req.on('data', (chunk) => {
      command += chunk;
    });

    req.on('end', () => {
      // fish cannot read commands from the socketpair node hands it as stdin,
      // so it gets them as an argument; zsh and bash keep the stdin protocol
      const shell =
        shellCommand === 'fish'
          ? spawn(shellCommand, args.concat(['-c', command]), {cwd: workingDir})
          : spawn(shellCommand, args, {cwd: workingDir});

      let setStatusOnce = (status: number): void => {
        res.writeHead(status);
        setStatusOnce = () => {};
      };

      shell.stderr.on('data', (d: Buffer) => {
        setStatusOnce(500);
        res.write(d);
      });

      shell.stdout.on('data', (d: Buffer) => {
        setStatusOnce(200);
        res.write(d);
      });

      shell.on('error', (err: Error) => {
        setStatusOnce(500);
        res.write(err.message);
      });

      shell.on('close', () => {
        setStatusOnce(200);
        res.end();
      });

      if (shellCommand !== 'fish') {
        shell.stdin.write(command);
        shell.stdin.write('\n');
        shell.stdin.end();
      }
    });
  };
};
