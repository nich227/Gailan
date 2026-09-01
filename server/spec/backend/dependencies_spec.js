//
//  dependencies_spec.js
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
const readWidgetSettings = require('../../src/readWidgetSettings');
const checkDependencies = require('../../src/checkDependencies');

function scratch(manifest) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'gailan-deps-'));
  const widget = path.join(dir, 'index.tsx');
  fs.writeFileSync(widget, 'export const render = () => null;\n');
  if (manifest !== undefined) {
    fs.writeFileSync(
      path.join(dir, 'widget.json'),
      typeof manifest === 'string' ? manifest : JSON.stringify(manifest)
    );
  }
  return {dir: dir, widget: widget};
}

test('a manifest with no dependencies declares none', (t) => {
  t.deepEqual(readWidgetSettings.dependenciesFor(scratch({}).widget), []);
  t.deepEqual(readWidgetSettings.dependenciesFor(scratch(undefined).widget), []);
  t.deepEqual(
    readWidgetSettings.dependenciesFor(scratch('not json').widget),
    [],
    'and neither does one that cannot be read'
  );
  t.deepEqual(
    readWidgetSettings.dependenciesFor(scratch({dependencies: {}}).widget),
    [],
    'nor one where dependencies is not a list'
  );
  t.end();
});

test('what a widget declares is carried through, and mistakes are dropped', (t) => {
  const {widget} = scratch({
    dependencies: [
      {type: 'command', name: 'ffmpeg', hint: 'brew install ffmpeg'},
      {type: 'shell', name: 'docker running', test: 'docker info'},
      {type: 'command', name: 'jq', test: 'ignored here'},
      {type: 'command'},
      {type: 'command', name: ''},
      {type: 'nonsense', name: 'x'},
      {name: 'x'},
      'ffmpeg',
      null,
    ],
  });

  const declared = readWidgetSettings.dependenciesFor(widget);

  t.deepEqual(
    declared,
    [
      {type: 'command', name: 'ffmpeg', hint: 'brew install ffmpeg'},
      {type: 'shell', name: 'docker running', test: 'docker info'},
      {type: 'command', name: 'jq'},
    ],
    'a hint is kept, a test belongs to shell only, and anything without a usable ' +
      'type and name is gone'
  );
  t.end();
});

test('a command is looked for on the path', (t) => {
  const {widget} = scratch({});

  checkDependencies(
    [
      {type: 'command', name: 'ls'},
      {type: 'command', name: 'gailan-nothing-is-called-this'},
    ],
    widget
  ).then((checked) => {
    t.equal(checked[0].state, 'present', 'ls is there');
    t.equal(checked[1].state, 'missing', 'and that is not');
    t.end();
  });
});

test('a shell test decides for itself, and a zero exit means present', (t) => {
  const {widget} = scratch({});

  checkDependencies(
    [
      {type: 'shell', name: 'always', test: 'true'},
      {type: 'shell', name: 'never', test: 'false'},
      {type: 'shell', name: 'unsaid'},
    ],
    widget
  ).then((checked) => {
    t.equal(checked[0].state, 'present');
    t.equal(checked[1].state, 'missing');
    t.equal(checked[2].state, 'missing', 'a shell entry with no test cannot pass');
    t.end();
  });
});

test('a type nobody has heard of is said to be that, rather than missing', (t) => {
  const {widget} = scratch({});

  checkDependencies([{type: 'cargo', name: 'serde'}], widget).then((checked) => {
    t.equal(
      checked[0].state,
      'unknown-type',
      'so the message can say something truthful about it'
    );
    t.end();
  });
});

test('nothing declared costs nothing', (t) => {
  checkDependencies([], scratch({}).widget).then((checked) => {
    t.deepEqual(checked, []);
    return checkDependencies(undefined, scratch({}).widget);
  }).then((checked) => {
    t.deepEqual(checked, []);
    t.end();
  });
});

test('a node module is found beside the widget', (t) => {
  const {dir, widget} = scratch({});
  fs.mkdirSync(path.join(dir, 'node_modules', 'carried-along'), {recursive: true});

  checkDependencies(
    [
      {type: 'node', name: 'carried-along'},
      {type: 'node', name: 'gailan-no-such-module'},
    ],
    widget
  ).then((checked) => {
    t.equal(checked[0].state, 'present', 'the widget can carry its own');
    t.equal(checked[1].state, 'missing');
    t.end();
  });
});

/* An interpreter that is missing is its own answer. Installing the package is not what
   somebody should be told to do when the thing that would run it is absent. */
test('the interpreter is checked before the package that needs it', (t) => {
  const {widget} = scratch({});
  const realPath = process.env.PATH;
  // nothing is on the path, so python3 cannot be found
  process.env.PATH = path.join(os.tmpdir(), 'gailan-empty-path');

  checkDependencies.forget();
  checkDependencies([{type: 'python', name: 'requests'}], widget)
    .then((checked) => {
      t.equal(checked[0].state, 'no-interpreter');
      t.equal(checked[0].name, 'requests', 'and it still says what was asked for');
    })
    .then(() => {
      process.env.PATH = realPath;
      checkDependencies.forget();
      t.end();
    });
});

test('an answer is kept, and forgetting it asks again', (t) => {
  const {widget} = scratch({});
  const declared = [{type: 'command', name: 'ls'}];

  checkDependencies.forget();
  const first = Date.now();
  checkDependencies(declared, widget)
    .then(() => {
      const cold = Date.now() - first;
      const second = Date.now();
      return checkDependencies(declared, widget).then((checked) => {
        t.equal(checked[0].state, 'present');
        t.ok(
          Date.now() - second <= cold,
          'the second answer costs no more than the first, being the same answer'
        );
      });
    })
    .then(() => {
      checkDependencies.forget();
      t.equal(typeof checkDependencies.PATIENCE, 'number', 'and a check is bounded');
      t.ok(checkDependencies.TYPES.indexOf('brew') > -1, 'brew is a type');
      t.end();
    });
});

test('a ruby library is asked of ruby itself', (t) => {
  const {widget} = scratch({});

  checkDependencies(
    [
      {type: 'ruby', name: 'json'},
      {type: 'ruby', name: 'gailan-no-such-gem'},
    ],
    widget
  ).then((checked) => {
    // ruby ships with macOS, so this says something about the library either way
    t.ok(
      checked[0].state === 'present' || checked[0].state === 'no-interpreter',
      'json is in the standard library where ruby is there at all'
    );
    t.ok(
      checked[1].state === 'missing' || checked[1].state === 'no-interpreter',
      'and a gem nobody has is not'
    );
    t.end();
  });
});

/* Asked of the filesystem rather than of brew, which shells out to ruby and costs about
   a second per formula. */
test('a formula is looked for under brew prefix', (t) => {
  const {widget} = scratch({});
  const started = Date.now();

  checkDependencies(
    [{type: 'brew', name: 'gailan-no-such-formula'}],
    widget
  ).then((checked) => {
    t.ok(
      checked[0].state === 'missing' || checked[0].state === 'no-interpreter',
      'a formula nobody has installed is missing, or brew itself is absent'
    );
    t.ok(
      Date.now() - started < checkDependencies.PATIENCE,
      'and it answers inside the time a check is given'
    );
    t.end();
  });
});
