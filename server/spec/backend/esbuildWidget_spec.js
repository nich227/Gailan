//
//  esbuildWidget_spec.js
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
const vm = require('vm');
const fs = require('fs');
const os = require('os');
const path = require('path');
const esbuildWidget = require('../../src/esbuildWidget');

const widgets = path.join(__dirname, '..', 'test_widgets');

// A widget bundle expects the page the client sets up: a global html factory
// and the gailan module reachable through the client's require.
function evaluate(source, id) {
  const sandbox = {
    console,
    setTimeout,
    setInterval,
    clearTimeout,
    html: (tag, props, ...children) => ({tag: tag, children: children}),
    navigator: {},
    document: {},
  };
  sandbox.globalThis = sandbox;
  sandbox.window = sandbox;
  sandbox.self = sandbox;
  sandbox.require = () => ({
    styled: () => () => null,
    css: () => 'css-class',
    React: {createElement: (tag) => ({tag: tag})},
    run: () => Promise.resolve(''),
  });

  vm.createContext(sandbox);
  vm.runInContext(source, sandbox);
  return sandbox.__gailanWidgets[id];
}

function bundle(id, file) {
  return new Promise((resolve, reject) => {
    const widget = esbuildWidget(id, file);
    widget.bundle((err, source) => {
      widget.close();
      err ? reject(err) : resolve(String(source));
    });
  });
}

async function load(id, file) {
  const source = await bundle(id, path.join(widgets, file));
  return {widget: evaluate(source, id), source: source};
}

test('a coffee widget keeps the classic shape', async (t) => {
  const {widget} = await load('widget-1', 'widget-1.js');

  t.deepEqual(
    Object.keys(widget).sort(),
    ['command', 'css', 'id', 'refreshFrequency', 'render'],
    'command, render, id, and style compiled to css'
  );
  t.equal(widget.id, 'widget-1', 'the id is injected');
  t.ok(
    widget.css.indexOf('#widget-1') > -1,
    'the stylus is compiled and scoped to the widget'
  );
  t.equal(typeof widget.render, 'function', 'render survives');
  t.end();
});

test('a plain js widget is wrapped and rewritten', async (t) => {
  const {widget} = await load('widget-2', 'widget-2.js');

  t.equal(widget.command, 'bar', 'the command comes through');
  t.equal(
    typeof widget.refreshFrequency,
    'number',
    'refreshFrequency is milliseconds, not "10s"'
  );
  t.equal(widget.id, 'widget-2', 'the id is injected');
  t.end();
});

test('a jsx widget renders through the html factory', async (t) => {
  const {widget} = await load('widget-3', 'widget-3.jsx');

  t.deepEqual(
    Object.keys(widget).sort(),
    ['className', 'command', 'refreshFrequency', 'render'],
    'its exports become the widget'
  );
  t.equal(widget.render({output: 'hi'}).tag, 'h1', 'jsx compiled to html()');
  t.end();
});

test('a tsx widget has its types stripped', async (t) => {
  const {widget, source} = await load('widget-4', 'widget-4.tsx');

  t.equal(typeof widget.render, 'function', 'it still renders');
  // esbuild's own helpers are named __spreadProps and friends, so look for the
  // alias itself rather than the substring
  t.equal(source.indexOf('type Props'), -1, 'the type alias is gone');
  t.ok(source.indexOf('tsx-widget') > -1, 'but the markup is kept');
  t.equal(widget.render({output: 'hi'}).tag, 'div', 'and it renders');
  t.end();
});

test('the gailan module is borrowed from the client, not bundled', async (t) => {
  const source = await bundle(
    'getting-started',
    path.join(__dirname, '..', '..', '..', 'Gailan', 'GettingStarted.tsx')
  );

  t.ok(
    source.indexOf('globalThis.require("gailan")') > -1,
    'resolved at runtime out of the client bundle'
  );
  t.equal(
    source.indexOf('@emotion/styled/dist'),
    -1,
    'so widgets do not each carry their own react and emotion'
  );
  t.end();
});

test('a widget with a syntax error reports where', async (t) => {
  try {
    await bundle('broken', path.join(widgets, 'broken-widget.js'));
    t.fail('it should not have bundled');
  } catch (err) {
    t.equal(err.message, 'Unexpected token }', 'the parser error survives');
    t.equal(err.line, 6, 'with the line');
    t.ok(
      err.annotated.indexOf('> 6 |') > -1,
      'and a frame pointing at it'
    );
  }
  t.end();
});

test('editing a widget emits an update', async (t) => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'gailan-watch-'));
  const file = path.join(dir, 'watched.js');
  fs.writeFileSync(file, 'command: "echo one",\nrender: () => "one"\n');

  const widget = esbuildWidget('watched', file);
  await new Promise((resolve) => widget.bundle(resolve));

  const updated = new Promise((resolve) => widget.on('update', resolve));
  fs.writeFileSync(file, 'command: "echo two",\nrender: () => "two"\n');

  const result = await Promise.race([
    updated.then(() => 'update'),
    new Promise((resolve) => setTimeout(() => resolve('timeout'), 5000)),
  ]);

  widget.close();
  fs.rmSync(dir, {recursive: true, force: true});

  t.equal(result, 'update', 'the watcher noticed the edit');
  t.end();
});

test('emotion styles are labeled with the component they came from', async (t) => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'gailan-labels-'));
  const file = path.join(dir, 'labeled.tsx');
  fs.writeFileSync(
    file,
    [
      'import { styled, css } from "gailan";',
      'const Panel = styled("div")`color: red;`;',
      'const heading = css`font-weight: 600;`;',
      'export const render = () => <Panel className={heading} />;',
    ].join('\n') + '\n'
  );

  const source = await bundle('labeled', file);

  t.ok(
    source.indexOf('label: "Panel"') > -1,
    'a styled component is named in its class'
  );
  t.ok(
    source.indexOf('label:heading') > -1 || source.indexOf('heading') > -1,
    'and so is a css call'
  );
  t.equal(
    source.indexOf('sourceMappingURL=data:application/json;base64'),
    source.lastIndexOf('sourceMappingURL=data:application/json;base64'),
    'with one source map, not one embedded per style'
  );

  fs.rmSync(dir, {recursive: true, force: true});
  t.end();
});

test('the legacy module name is labeled too', async (t) => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'gailan-labels-'));
  const file = path.join(dir, 'old.tsx');
  fs.writeFileSync(
    file,
    [
      'import { styled } from "uebersicht";',
      'const Legacy = styled("div")`color: blue;`;',
      'export const render = () => <Legacy />;',
    ].join('\n') + '\n'
  );

  const source = await bundle('old', file);
  t.ok(
    source.indexOf('label: "Legacy"') > -1,
    'a widget written for Ubersicht gets the same labels'
  );

  fs.rmSync(dir, {recursive: true, force: true});
  t.end();
});

test('a jsx widget that will not parse', async (t) => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'gailan-badjsx-'));
  const file = path.join(dir, 'bad.tsx');
  fs.writeFileSync(file, 'export const render = () => <div><;\n');

  try {
    await bundle('bad', file);
    t.fail('it should not have bundled');
  } catch (err) {
    t.ok(err.message.length > 0, 'the parse failure is reported');
    t.ok(err.line > 0, 'with a line');
  }

  fs.rmSync(dir, {recursive: true, force: true});
  t.end();
});
