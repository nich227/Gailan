const test = require('tape');
const path = require('path');
const fs = require('fs');

const WidgetBundler = require('../../src/WidgetBundler.js');
const fixturePath = path.resolve(__dirname, '../test_widgets');
const bundler = WidgetBundler();
var callback = () => {};

test('bundling widgets', (t) => {
  const action = {
    type: 'added',
    filePath: path.join(fixturePath, 'widget-1.js'),
    id: 'widget-1',
  };

  callback = (event) => {
    t.equal(event.type, 'added', 'it emits an "added" event');
    t.equal(typeof event.widget, 'object', 'it emits a widget object');
    t.equal(event.widget.id, 'widget-1', 'the widget object has an id');
    t.equal(
      event.widget.filePath,
      action.filePath,
      'the widget object contains the original file path',
    );
    t.equal(
      typeof event.widget.body,
      'string',
      'it also contains a string with the widget source code',
    );

    // the bundle publishes itself into the registry the client reads
    eval(event.widget.body);
    t.equal(
      globalThis.__gailanWidgets['widget-1'].command,
      'foo',
      'the source registers the widget under its id',
    );
    callback = () => {};
    t.end();
  };

  bundler.push(action, (event) => callback(event));
});

test('watching widgets', (t) => {
  callback = (event) => {
    t.equal(event.type, 'added', 'it emits another "added" event');
    t.equal(event.widget.id, 'widget-1', 'for the correct widget');
    t.equal(typeof event.widget.body, 'string', 'with the widget source code');
    t.end();
  };

  fs.utimes(
    path.join(fixturePath, 'widget-1.js'),
    Date.now(),
    Date.now(),
    () => {},
  );
});

test('removing widgets', (t) => {
  const action = {
    type: 'removed',
    filePath: path.join(fixturePath, 'widget-1.js'),
    id: 'widget-1',
  };

  callback = (event) => {
    t.equal(event.type, 'removed', 'it emits a "removed" event');
    t.equal(event.id, 'widget-1', 'for the correct widget');
    callback = () => {};
    t.end();
  };

  bundler.push(action, (event) => callback(event));
});

test('closing', (t) => {
  bundler.close();
  t.pass('it closes');
  t.end();
});
