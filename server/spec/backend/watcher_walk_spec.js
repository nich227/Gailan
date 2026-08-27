//
//  watcher_walk_spec.js
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
const watchDir = require('../../src/directory_watcher.ts');

// The first walk of the widget folder, which is how widgets already on disk are
// found. Symlinks are followed, and things that go missing while walking are
// stepped over rather than thrown.
function scratch() {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'gailan-walk-'));
}

test('a folder that is not there', (t) => {
  t.throws(
    () => watchDir(path.join(os.tmpdir(), 'definitely-not-here-at-all'), () => {}),
    /could not find/,
    'it says so rather than watching nothing'
  );
  t.end();
});

test('walking symlinks', (t) => {
  const dir = scratch();
  const real = path.join(dir, 'real');
  fs.mkdirSync(real);
  fs.writeFileSync(path.join(real, 'inside.js'), 'command: "echo hi"\n');
  fs.writeFileSync(path.join(dir, 'plain.js'), 'command: "echo hi"\n');

  // a link to a directory, and a link to a file: both are followed by a stat
  fs.symlinkSync(real, path.join(dir, 'link-to-dir'));
  fs.symlinkSync(path.join(real, 'inside.js'), path.join(dir, 'link-to-file'));

  const found = [];
  const stop = watchDir(dir, (event) => {
    if (event.type === 'added') found.push(path.relative(dir, event.filePath));
  });

  setTimeout(() => {
    stop();
    t.ok(found.indexOf('plain.js') > -1, 'a plain file is found');
    t.ok(found.indexOf(path.join('real', 'inside.js')) > -1, 'so is a nested one');
    t.ok(
      found.some((f) => f.indexOf('link-to-file') > -1),
      'a link to a file is followed'
    );
    t.ok(
      found.some((f) => f.indexOf('link-to-dir') > -1),
      'and so is a link to a directory'
    );
    fs.rmSync(dir, {recursive: true, force: true});
    t.end();
  }, 400);
});

test('a link that points nowhere', (t) => {
  const dir = scratch();
  fs.writeFileSync(path.join(dir, 'real.js'), 'command: "echo hi"\n');
  fs.symlinkSync(path.join(dir, 'missing-target'), path.join(dir, 'dangling'));

  const found = [];
  const logged = [];
  const realLog = console.log;
  console.log = (message) => logged.push(message);

  const stop = watchDir(dir, (event) => {
    found.push(path.relative(dir, event.filePath));
  });

  setTimeout(() => {
    console.log = realLog;
    stop();
    t.ok(found.indexOf('real.js') > -1, 'the walk carries on past it');
    t.equal(
      logged.filter((l) => l && l.code === 'ENOENT').length,
      0,
      'and a missing target is passed over quietly, not logged'
    );
    fs.rmSync(dir, {recursive: true, force: true});
    t.end();
  }, 400);
});

test('a folder that disappears mid-walk', (t) => {
  const dir = scratch();
  const doomed = path.join(dir, 'doomed');
  fs.mkdirSync(doomed);
  for (let i = 0; i < 40; i++) {
    fs.writeFileSync(path.join(doomed, `w${i}.js`), 'command: "echo hi"\n');
  }

  const logged = [];
  const realLog = console.log;
  console.log = (message) => logged.push(message);

  const stop = watchDir(dir, () => {});
  // pull the folder out from under the walk
  fs.rmSync(doomed, {recursive: true, force: true});

  setTimeout(() => {
    console.log = realLog;
    stop();
    t.pass('the walk survives the folder going away');
    fs.rmSync(dir, {recursive: true, force: true});
    t.end();
  }, 400);
});

test('watching stops when told to', (t) => {
  const dir = scratch();
  fs.writeFileSync(path.join(dir, 'one.js'), 'command: "echo hi"\n');

  let events = 0;
  const stop = watchDir(dir, () => {
    events += 1;
  });

  setTimeout(() => {
    stop();
    const seenBefore = events;
    fs.writeFileSync(path.join(dir, 'two.js'), 'command: "echo hi"\n');

    setTimeout(() => {
      t.equal(events, seenBefore, 'nothing is reported after closing');
      fs.rmSync(dir, {recursive: true, force: true});
      t.end();
    }, 400);
  }, 400);
});
