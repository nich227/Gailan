//
//  widgetSettings_spec.js
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
const widgetConfigFile = require('../../src/widgetConfigFile');

// What a widget declares in its manifest, and what the user chose, saved beside
// the widget.
function scratch(manifest) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'gailan-manifest-'));
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

test('a widget with no manifest', (t) => {
  const {dir, widget} = scratch(undefined);

  t.deepEqual(readWidgetSettings(widget), [], 'declares no settings');
  t.equal(readWidgetSettings.titleFor(widget), null, 'and has no title');

  fs.rmSync(dir, {recursive: true, force: true});
  t.end();
});

test('a manifest that is not JSON', (t) => {
  const {dir, widget} = scratch('{ this is not json');

  t.deepEqual(readWidgetSettings(widget), [], 'is ignored rather than thrown');
  t.equal(readWidgetSettings.titleFor(widget), null, 'including for the title');

  fs.rmSync(dir, {recursive: true, force: true});
  t.end();
});

test('a manifest with no settings key', (t) => {
  const {dir, widget} = scratch({title: 'Just A Title'});

  t.deepEqual(readWidgetSettings(widget), [], 'nothing to configure');
  t.equal(readWidgetSettings.titleFor(widget), 'Just A Title', 'but a title');

  fs.rmSync(dir, {recursive: true, force: true});
  t.end();
});

test('a title that is not a string', (t) => {
  const {dir, widget} = scratch({title: 42, settings: []});

  t.equal(readWidgetSettings.titleFor(widget), null, 'is refused');

  fs.rmSync(dir, {recursive: true, force: true});
  t.end();
});

test('settings that are not an array', (t) => {
  const {dir, widget} = scratch({settings: {size: 'medium'}});

  t.deepEqual(readWidgetSettings(widget), [], 'are ignored');

  fs.rmSync(dir, {recursive: true, force: true});
  t.end();
});

test('a choice setting', (t) => {
  const {dir, widget} = scratch({
    settings: [
      {
        key: 'size',
        type: 'choice',
        label: 'Size',
        help: 'How wide',
        default: 'medium',
        options: ['small', {value: 'medium', label: 'Medium'}],
      },
    ],
  });

  const [setting] = readWidgetSettings(widget);
  t.equal(setting.key, 'size');
  t.equal(setting.label, 'Size');
  t.equal(setting.help, 'How wide');
  t.equal(setting.default, 'medium');
  t.deepEqual(
    setting.options,
    [
      {value: 'small', label: 'small'},
      {value: 'medium', label: 'Medium'},
    ],
    'a bare string becomes its own label, an object keeps the one it gave'
  );

  fs.rmSync(dir, {recursive: true, force: true});
  t.end();
});

test('a choice with nothing to choose from', (t) => {
  const {dir, widget} = scratch({
    settings: [
      {key: 'empty', type: 'choice', options: []},
      {key: 'missing', type: 'choice'},
    ],
  });

  t.deepEqual(
    readWidgetSettings(widget),
    [],
    'is dropped, since the control would be empty'
  );

  fs.rmSync(dir, {recursive: true, force: true});
  t.end();
});

test('a number setting fills in its bounds', (t) => {
  const {dir, widget} = scratch({
    settings: [
      {key: 'opacity', type: 'number', default: 40},
      {key: 'bounded', type: 'number', min: 5, max: 50, step: 5},
    ],
  });

  const [loose, bounded] = readWidgetSettings(widget);
  t.deepEqual(
    [loose.min, loose.max, loose.step],
    [0, 100, 1],
    'without bounds it gets sensible ones'
  );
  t.deepEqual([bounded.min, bounded.max, bounded.step], [5, 50, 5], 'or its own');
  t.equal(loose.label, 'opacity', 'and the key stands in for a missing label');

  fs.rmSync(dir, {recursive: true, force: true});
  t.end();
});

test('settings that make no sense', (t) => {
  const {dir, widget} = scratch({
    settings: [
      {key: 'nope', type: 'rocket'},
      {type: 'toggle'},
      {key: '', type: 'toggle'},
      {key: 'fine', type: 'toggle'},
      'not an object',
      null,
    ],
  });

  t.deepEqual(
    readWidgetSettings(widget).map((s) => s.key),
    ['fine'],
    'only the usable one survives'
  );

  fs.rmSync(dir, {recursive: true, force: true});
  t.end();
});

test('every remaining type is accepted', (t) => {
  const {dir, widget} = scratch({
    settings: [
      {key: 'name', type: 'text'},
      {key: 'tint', type: 'color', default: '#ff0000ff'},
      {key: 'on', type: 'toggle', default: true},
    ],
  });

  t.deepEqual(
    readWidgetSettings(widget).map((s) => s.type),
    ['text', 'color', 'toggle'],
    'text, color and toggle'
  );

  fs.rmSync(dir, {recursive: true, force: true});
  t.end();
});

test('collecting the declared defaults', (t) => {
  const schema = [
    {key: 'a', type: 'toggle', default: false},
    {key: 'b', type: 'text'},
    {key: 'c', type: 'number', default: 7},
  ];

  t.deepEqual(
    readWidgetSettings.defaultsFor(schema),
    {a: false, c: 7},
    'a setting with no default contributes nothing'
  );
  t.deepEqual(readWidgetSettings.defaultsFor(), {}, 'and nothing at all is fine');
  t.end();
});

test('saved settings beside a widget', (t) => {
  const {dir, widget} = scratch({settings: []});

  t.deepEqual(widgetConfigFile.read(widget), {}, 'nothing saved yet');

  t.equal(
    widgetConfigFile.write(widget, {size: 'large'}),
    true,
    'the first write happens'
  );
  t.deepEqual(
    widgetConfigFile.read(widget),
    {size: 'large'},
    'and reads back'
  );

  t.equal(
    widgetConfigFile.write(widget, {size: 'large'}),
    false,
    'writing the same thing again is skipped'
  );
  t.equal(
    widgetConfigFile.write(widget, {size: 'small'}),
    true,
    'a real change is written'
  );

  const onDisk = path.join(dir, 'settings.json');
  t.ok(fs.existsSync(onDisk), 'it sits beside the widget');
  t.ok(
    fs.readFileSync(onDisk, 'utf8').endsWith('\n'),
    'and is a tidy file, not a bare line'
  );

  fs.rmSync(dir, {recursive: true, force: true});
  t.end();
});

test('a settings file that is not usable', (t) => {
  const {dir, widget} = scratch({settings: []});

  fs.writeFileSync(path.join(dir, 'settings.json'), '["not", "an", "object"]');
  t.deepEqual(widgetConfigFile.read(widget), {}, 'an array is not settings');

  fs.writeFileSync(path.join(dir, 'settings.json'), 'nonsense');
  t.deepEqual(widgetConfigFile.read(widget), {}, 'nor is a broken file');

  fs.rmSync(dir, {recursive: true, force: true});
  t.end();
});

test('settings that cannot be written', (t) => {
  const {dir, widget} = scratch({settings: []});
  // a directory where the file should be
  fs.mkdirSync(path.join(dir, 'settings.json'));

  const logged = [];
  const realLog = console.log;
  console.log = (message) => logged.push(message);

  const wrote = widgetConfigFile.write(widget, {size: 'large'});

  console.log = realLog;
  t.equal(wrote, false, 'it reports the failure');
  t.equal(logged.length, 1, 'and says so rather than throwing');

  fs.rmSync(dir, {recursive: true, force: true});
  t.end();
});

test('writing nothing at all', (t) => {
  const {dir, widget} = scratch({settings: []});

  t.equal(widgetConfigFile.write(widget), true, 'an empty config is still saved');
  t.deepEqual(widgetConfigFile.read(widget), {}, 'and reads back as empty');

  fs.rmSync(dir, {recursive: true, force: true});
  t.end();
});

// A list is a choice with a different control on it, so it has to survive the same
// journey: kept, options carried, and thrown out when there is nothing to choose from.
test('a list setting is read like a choice', (t) => {
  const {dir, widget} = scratch({
    settings: [
      {
        key: 'source',
        type: 'list',
        label: 'Metric to monitor',
        default: 'ram',
        options: [
          {value: 'ram', label: 'RAM Usage'},
          {value: 'cpu', label: 'CPU Usage'},
        ],
      },
    ],
  });

  const settings = readWidgetSettings(widget);

  t.equal(settings.length, 1, 'it is kept');
  t.equal(settings[0].type, 'list', 'as a list');
  t.equal(settings[0].label, 'Metric to monitor', 'with its label');
  t.deepEqual(
    settings[0].options.map((option) => option.value),
    ['ram', 'cpu'],
    'and everything there is to choose from'
  );

  fs.rmSync(dir, {recursive: true, force: true});
  t.end();
});

test('a list with nothing to choose from is dropped', (t) => {
  const {dir, widget} = scratch({
    settings: [{key: 'source', type: 'list', label: 'Metric to monitor'}],
  });

  t.deepEqual(readWidgetSettings(widget), [], 'an empty menu is no use to anybody');

  fs.rmSync(dir, {recursive: true, force: true});
  t.end();
});
