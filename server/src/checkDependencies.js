//
//  checkDependencies.js
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

// A widget can say what it needs to run. Each entry is checked with the cheapest
// thing that answers, and a widget missing something still runs its command: a
// widget may do less rather than nothing without what it asked for.

const {execFile} = require('child_process');
const path = require('path');

// A check that has not answered in this long is treated as unanswerable rather
// than left to hold up a widget. brew is the slow one and the reason this exists.
const PATIENCE = 4000;

/* Each type is a shell test that exits zero when the thing is there.

   An interpreter that is missing is reported as its own kind of absence, because
   "requests is not installed" and "python3 is not on this Mac" ask for different
   things from whoever reads it. */
const CHECKS = {
  command: (dep) => ({
    test: `command -v ${quote(dep.name)} > /dev/null 2>&1`,
  }),

  node: (dep, widgetDir) => ({
    /* The widget's own node_modules first, since a widget can carry its
       dependencies beside it, then wherever else node would look. */
    test:
      `[ -d ${quote(path.join(widgetDir, 'node_modules', dep.name))} ] || ` +
      `node -e ${quote(`require.resolve(${JSON.stringify(dep.name)})`)} > /dev/null 2>&1`,
  }),

  python: (dep) => ({
    interpreter: 'python3',
    test: `python3 -c ${quote(`import ${dep.name}`)} > /dev/null 2>&1`,
  }),

  ruby: (dep) => ({
    interpreter: 'ruby',
    test: `ruby -e ${quote(`require '${dep.name}'`)} > /dev/null 2>&1`,
  }),

  /* Asked of the filesystem rather than of brew. `brew list` shells out to ruby and
     takes the better part of a second per formula; the prefix is a directory brew
     maintains, so this is a stat. */
  brew: (dep) => ({
    interpreter: 'brew',
    test:
      `[ -e "$(brew --prefix 2>/dev/null)/opt/${dep.name}" ] || ` +
      `[ -e "$(brew --prefix 2>/dev/null)/Cellar/${dep.name}" ]`,
  }),

  /* The escape hatch: the widget says how to tell. No more dangerous than the rest
     of a widget, which already runs whatever shell it likes. */
  shell: (dep) => ({test: dep.test || 'false'}),
};

function quote(text) {
  return `'${String(text).replace(/'/g, `'\\''`)}'`;
}

function run(script, shell) {
  return new Promise((resolve) => {
    const child = execFile(
      shell,
      ['-c', script],
      {timeout: PATIENCE},
      (err) => resolve(!err)
    );
    child.on('error', () => resolve(false));
  });
}

/* Answers are kept for the life of the process and shared between widgets, so ten
   widgets asking for ffmpeg cost one check. Installing something while Gailan runs
   means refreshing the widget, which is when the widget is built again. */
const answered = new Map();

function checkOne(dep, widgetDir, shell) {
  const build = CHECKS[dep.type];
  if (!build) return Promise.resolve({...dep, state: 'unknown-type'});

  const {test, interpreter} = build(dep, widgetDir);
  const key = `${dep.type}:${dep.name}:${dep.test || ''}:${widgetDir}`;
  if (answered.has(key)) {
    return Promise.resolve({...dep, state: answered.get(key)});
  }

  const interpreterFirst = interpreter
    ? run(`command -v ${quote(interpreter)} > /dev/null 2>&1`, shell)
    : Promise.resolve(true);

  return interpreterFirst
    .then((haveInterpreter) => {
      if (!haveInterpreter) return 'no-interpreter';
      return run(test, shell).then((present) => (present ? 'present' : 'missing'));
    })
    .then((state) => {
      answered.set(key, state);
      return {...dep, state};
    });
}

module.exports = function checkDependencies(declared, widgetPath, shell) {
  if (!Array.isArray(declared) || !declared.length) return Promise.resolve([]);

  const widgetDir = path.dirname(widgetPath);
  return Promise.all(
    declared.map((dep) => checkOne(dep, widgetDir, shell || 'zsh'))
  );
};

// so a widget refreshed after installing something is told the truth
module.exports.forget = function forget() {
  answered.clear();
};

module.exports.PATIENCE = PATIENCE;
module.exports.TYPES = Object.keys(CHECKS);
