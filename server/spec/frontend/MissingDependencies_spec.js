//
//  MissingDependencies_spec.js
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

require('../helpers/domEnv.js');

const test = require('tape');
const React = require('react');
const {renderToStaticMarkup} = require('react-dom/server');
const MissingDependencies = require('../../src/MissingDependencies.js');

function draw(missing) {
  return renderToStaticMarkup(
    React.createElement(
      MissingDependencies,
      {missing: missing},
      React.createElement('div', null, 'the widget itself')
    )
  );
}

const textOf = (markup) => markup.replace(/<[^>]+>/g, '');

test('the notice names what is not installed', (t) => {
  const text = textOf(
    draw([
      {type: 'command', name: 'ffmpeg', state: 'missing'},
      {type: 'command', name: 'cowsay', state: 'missing'},
    ])
  );

  t.ok(
    text.indexOf(
      'This widget requires dependencies that are not yet installed: ffmpeg, cowsay'
    ) > -1,
    'as one sentence and a list'
  );
  t.end();
});

test('the widget is still drawn, behind the notice', (t) => {
  const markup = draw([{type: 'command', name: 'ffmpeg', state: 'missing'}]);

  t.ok(markup.indexOf('the widget itself') > -1, 'its own content is there');
  t.ok(markup.indexOf('filter:blur') > -1, 'blurred');
  t.ok(
    markup.indexOf('pointer-events:none') > -1,
    'and taking no clicks while it cannot work'
  );
  t.end();
});

/* A long list has to stay inside a widget that may be narrow. */
test('the notice is allowed to wrap', (t) => {
  const markup = draw([
    {type: 'command', name: 'ffmpeg', state: 'missing'},
    {type: 'brew', name: 'imagemagick', state: 'missing'},
    {type: 'python', name: 'beautifulsoup4', state: 'missing'},
  ]);

  t.ok(markup.indexOf('overflow-wrap:anywhere') > -1);
  t.ok(markup.indexOf('word-break:break-word') > -1);
  t.end();
});

/* Naming the package would send somebody to install it with a tool that is not there. */
test('a missing interpreter is named instead of the package', (t) => {
  t.equal(
    textOf(draw([{type: 'python', name: 'requests', state: 'no-interpreter'}])),
    'the widget itselfThis widget requires dependencies that are not yet installed: python3'
  );

  t.ok(
    textOf(draw([{type: 'ruby', name: 'nokogiri', state: 'no-interpreter'}])).indexOf(
      'ruby'
    ) > -1
  );
  t.ok(
    textOf(draw([{type: 'brew', name: 'jq', state: 'no-interpreter'}])).indexOf('brew') >
      -1
  );
  t.ok(
    textOf(draw([{type: 'node', name: 'chalk', state: 'no-interpreter'}])).indexOf(
      'node'
    ) > -1
  );
  t.ok(
    textOf(draw([{type: 'cargo', name: 'serde', state: 'no-interpreter'}])).indexOf(
      'serde'
    ) > -1,
    'and a type with no interpreter of its own falls back to the name'
  );
  t.end();
});

test('the same name twice is said once', (t) => {
  const text = textOf(
    draw([
      {type: 'python', name: 'requests', state: 'no-interpreter'},
      {type: 'python', name: 'numpy', state: 'no-interpreter'},
    ])
  );

  t.ok(text.indexOf('python3') > -1);
  t.equal(text.indexOf('python3'), text.lastIndexOf('python3'), 'only once');
  t.end();
});

test('nothing missing draws nothing over the widget', (t) => {
  const markup = renderToStaticMarkup(
    React.createElement(
      MissingDependencies,
      {},
      React.createElement('div', null, 'the widget itself')
    )
  );

  t.ok(markup.indexOf('the widget itself') > -1, 'the widget is still there');
  t.equal(
    textOf(markup),
    'the widget itselfThis widget requires dependencies that are not yet installed: ',
    'and with no list, since this is only reached when something is missing'
  );
  t.end();
});
