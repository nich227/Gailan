//
//  reportGlassRegions_spec.js
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
const reportGlassRegions = require('../../src/reportGlassRegions');

// jsdom has no layout, so elements report zero-sized boxes. stub the geometry.
function claim(id, box, radius) {
  const el = document.createElement('div');
  el.id = id;
  el.dataset.gailanDesktopGlass = radius;
  el.getBoundingClientRect = () => box;
  document.body.appendChild(el);
  return el;
}

function collectSent(fn) {
  const sent = [];
  window.webkit = {messageHandlers: {gailan: {postMessage: (m) => sent.push(m)}}};
  fn();
  return sent;
}

function flush() {
  return new Promise((resolve) => requestAnimationFrame(() => resolve()));
}

test('reports a claimed region in the app\'s coordinates', async (t) => {
  document.body.innerHTML = '';
  claim('lens', {left: 40.4, top: 60.6, width: 200.2, height: 100.7}, 18);

  const sent = collectSent(() => reportGlassRegions());
  await flush();

  t.equal(sent.length, 1, 'one message');
  t.equal(sent[0].type, 'glassRegions', 'tagged so the app can route it');
  t.deepEqual(
    sent[0].regions,
    [{id: 'lens', x: 40, y: 61, w: 200, h: 101, radius: 18}],
    'rounded to whole pixels, radius from the marker'
  );
  t.end();
});

test('says nothing when nothing moved', async (t) => {
  document.body.innerHTML = '';
  claim('lens', {left: 0, top: 0, width: 100, height: 100}, 8);

  const sent = collectSent(() => {
    reportGlassRegions();
    reportGlassRegions();
  });
  await flush();
  await flush();

  t.equal(sent.length, 1, 'the identical second report is dropped');
  t.end();
});

test('a widget that stops asking has its region withdrawn', async (t) => {
  document.body.innerHTML = '';
  const el = claim('withdrawn', {left: 5, top: 5, width: 120, height: 90}, 8);

  const sent = collectSent(() => reportGlassRegions());
  await flush();
  t.equal(sent[0].regions.length, 1, 'claimed first');

  el.remove();
  reportGlassRegions();
  await flush();

  t.deepEqual(sent[1].regions, [], 'then withdrawn');
  t.end();
});

test('zero-sized claims are ignored', async (t) => {
  document.body.innerHTML = '';
  const el = claim('flat', {left: 0, top: 0, width: 100, height: 100}, 8);

  const sent = collectSent(() => reportGlassRegions());
  await flush();
  t.equal(sent[0].regions.length, 1, 'claimed while it had a size');

  // a widget mid-render, or hidden: nothing for the system to glass
  el.getBoundingClientRect = () => ({left: 0, top: 0, width: 0, height: 0});
  reportGlassRegions();
  await flush();

  t.deepEqual(sent[1].regions, [], 'dropped once it has no size');
  t.end();
});

test('does not throw outside the app', async (t) => {
  document.body.innerHTML = '';
  claim('lens', {left: 0, top: 0, width: 10, height: 10}, 4);
  delete window.webkit;

  t.doesNotThrow(() => reportGlassRegions(), 'no message handler, no error');
  await flush();
  t.end();
});
