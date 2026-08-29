//
//  gailan_spec.js
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
const gailan = require('../../src/gailan.ts');
const uebersicht = require('../../src/legacyAlias.ts');

// What a widget gets when it imports "gailan". Übersicht exported exactly run,
// request, css, styled and React, and Gailan keeps that surface so widgets carry
// over unchanged. DesktopGlass and constrainDrag are added. Adding is fine, taking
// away breaks widgets.
test('the module a widget imports', (t) => {
  t.deepEqual(
    Object.keys(gailan).sort(),
    ['DesktopGlass', 'React', 'constrainDrag', 'css', 'request', 'run', 'styled'],
    "the surface widgets are written against, which is Übersicht's plus what Gailan adds"
  );
  t.equal(typeof gailan.run, 'function', 'run executes shell commands');
  t.equal(typeof gailan.css, 'function', 'css comes from emotion');
  t.equal(typeof gailan.styled, 'function', 'so does styled');
  t.equal(typeof gailan.React.createElement, 'function', 'react is passed through');
  t.end();
});

test('the old module name', (t) => {
  t.equal(
    uebersicht,
    gailan,
    'importing uebersicht gives the same module, so old widgets still work'
  );
  t.end();
});

test('marking an area for desktop glass', (t) => {
  const element = gailan.DesktopGlass({
    radius: 20,
    style: {padding: 10},
    id: 'a-widget',
    children: 'content',
  });

  t.equal(element.type, 'div', 'it is a plain div');
  t.equal(
    element.props['data-gailan-desktop-glass'],
    20,
    'carrying the radius the app reads'
  );
  t.deepEqual(
    element.props.style,
    {borderRadius: 20, padding: 10},
    'with the radius applied to the box and the widget style kept'
  );
  t.equal(element.props.id, 'a-widget', 'other props pass through');
  t.equal(element.props.children, 'content', 'and the children are inside');
  t.end();
});

test('desktop glass with nothing specified', (t) => {
  const element = gailan.DesktopGlass({});

  t.equal(
    element.props['data-gailan-desktop-glass'],
    12,
    'there is a default radius'
  );
  t.deepEqual(element.props.style, {borderRadius: 12}, 'and a matching box');
  t.end();
});
