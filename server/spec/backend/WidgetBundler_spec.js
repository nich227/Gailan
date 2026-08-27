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

test('reading a bundle back by id', (t) => {
  const fresh = WidgetBundler();
  const action = {
    type: 'added',
    filePath: path.join(fixturePath, 'widget-2.js'),
    id: 'widget-2',
  };

  fresh.push(action, () => {
    t.ok(
      fresh.get('widget-2').length > 0,
      'the source is available under the widget id'
    );
    fresh.close();
    t.end();
  });
});

test('a widget that will not bundle', (t) => {
  const broken = WidgetBundler();
  const action = {
    type: 'added',
    filePath: path.join(fixturePath, 'broken-widget.js'),
    id: 'broken-widget',
  };

  broken.push(action, (event) => {
    t.equal(event.type, 'added', 'it is still reported');
    t.notOk(event.widget.body, 'with no source');

    const error = JSON.parse(event.widget.error);
    t.equal(error.message, 'Unexpected token }', 'and the parser error');
    t.equal(error.line, 6, 'with the line it happened on');
    t.ok(error.lines.indexOf('> 6 |') > -1, 'and a frame around it');
    t.equal(error.path, action.filePath, 'named by file');

    broken.close();
    t.end();
  });
});

test('closing', (t) => {
  bundler.close();
  t.pass('it closes');
  t.end();
});
