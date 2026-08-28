//
//  directory_watcher.ts
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

const paths = require('path');
const fs = require('fs');
const fsevents = require('fsevents');
const isInsidePath = require('./isInsidePath.ts');

type PathType = 'file' | 'directory';

type FileEvent = {
  type: 'added' | 'removed';
  filePath: string;
  rootPath: string;
};

module.exports = function directoryWatcher(
  directoryPath: string,
  callback: (event: FileEvent) => void
): () => void {
  const foundPaths: {[path: string]: boolean} = {};
  let closed = true;
  let stopWatching: (() => void) | null = null;

  function init(): () => void {
    if (!fs.existsSync(directoryPath)) {
      throw new Error(`could not find ${directoryPath}`);
    }

    closed = false;
    stopWatching = fsevents.watch(
      directoryPath,
      (filePath: string, flags: number, id: string) => {
        if (closed) return;
        const info = fsevents.getInfo(filePath, flags, id);
        switch (info.event) {
          case 'modified':
          case 'created':
            findFiles(filePath, info.type, registerFile);
            break;
          case 'deleted':
            unregisterFiles(filePath);
            break;
          case 'moved':
            unregisterFiles(filePath);
            findFiles(filePath, info.type, registerFile);
            break;
        }
      }
    );

    console.log('watching', directoryPath);

    findFiles(directoryPath, 'directory', registerFile);
    return close;
  }

  function close(): void {
    closed = true;
    if (stopWatching) stopWatching();
  }

  function registerFile(filePath: string): void {
    const normalized = filePath.normalize();
    foundPaths[normalized] = true;
    callback({
      type: 'added',
      filePath: normalized,
      rootPath: directoryPath,
    });
  }

  function unregisterFiles(path: string): void {
    const normalized = path.normalize();
    Object.keys(foundPaths)
      .filter((filePath) => isInsidePath(filePath, normalized))
      .forEach((filePath) => {
        delete foundPaths[filePath];
        callback({
          type: 'removed',
          filePath: filePath,
          rootPath: directoryPath,
        });
      });
  }

  function logUnlessGone(err: NodeJS.ErrnoException): void {
    if (err.code !== 'ENOENT') console.log(err);
  }

  // recursively walks the directory tree and calls onFound for every file it
  // finds
  function findFiles(
    path: string,
    type: PathType,
    onFound: (filePath: string) => void
  ): void {
    if (type === 'file') {
      onFound(path);
      return;
    }

    fs.readdir(
      path,
      {withFileTypes: true},
      (err: NodeJS.ErrnoException, entries: any[]) => {
        // the directory can be deleted while we are still walking it
        if (err) return logUnlessGone(err);
        entries.forEach((entry) => {
          const fullPath = paths.join(path, entry.name);
          if (entry.isSymbolicLink()) {
            // stat follows the link, which is what the old walk always did
            getPathType(fullPath, (p, t) => findFiles(p, t, onFound));
          } else {
            findFiles(
              fullPath,
              entry.isDirectory() ? 'directory' : 'file',
              onFound
            );
          }
        });
      }
    );
  }

  // get type of path as either 'file' or 'directory'. callback gets called with
  // (path, type) where path is the path passed in, for convenience
  function getPathType(
    path: string,
    callback: (path: string, type: PathType) => void
  ): void {
    fs.stat(path, (err: NodeJS.ErrnoException, stat: any) => {
      if (err) return logUnlessGone(err);
      callback(path, stat.isDirectory() ? 'directory' : 'file');
    });
  }

  return init();
};
