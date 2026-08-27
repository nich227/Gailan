//
//  loop_spec.js
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
const detectWidgetHover = require('../../src/detectWidgetHover');
const RenderLoop = require('../../src/renderLoop');

// Widget windows ignore the mouse until the pointer is over a widget, which is
// what the app is told here.
function collectMessages() {
  const sent = [];
  window.webkit = {
    messageHandlers: {gailan: {postMessage: (m) => sent.push(m)}},
  };
  return sent;
}

function moveOver(target) {
  const event = new window.MouseEvent('mousemove', {bubbles: true});
  Object.defineProperty(event, 'target', {value: target});
  window.dispatchEvent(event);
}

function tick() {
  return new Promise((resolve) => setTimeout(resolve, 40));
}

test('noticing the pointer entering and leaving a widget', async (t) => {
  const container = document.createElement('div');
  const widget = document.createElement('div');
  container.appendChild(widget);
  document.body.appendChild(container);

  const sent = collectMessages();
  detectWidgetHover(container);

  moveOver(widget);
  t.deepEqual(sent, ['widgetEnter'], 'over a widget, the window takes clicks');

  await tick();
  moveOver(container);
  t.deepEqual(
    sent,
    ['widgetEnter', 'widgetLeave'],
    'back over the desktop, it stops taking them'
  );

  await tick();
  moveOver(container);
  t.deepEqual(
    sent,
    ['widgetEnter', 'widgetLeave'],
    'and staying there says nothing further'
  );

  container.remove();
  t.end();
});

test('the render loop draws once for many updates', (t) => {
  let drawn = [];
  const loop = RenderLoop({first: true}, (state) => drawn.push(state));

  loop.update({second: true});
  loop.update({third: true});

  t.deepEqual(drawn, [], 'nothing is drawn synchronously');

  setTimeout(() => {
    t.deepEqual(
      drawn,
      [{third: true}],
      'one draw, with the newest state, not one per update'
    );
    t.deepEqual(loop.state, {third: true}, 'the loop keeps the latest state');
    t.end();
  }, 50);
});

test('an update from inside a render is refused', (t) => {
  let loop = null;
  let caught = null;

  loop = RenderLoop({first: true}, () => {
    try {
      loop.update({from: 'inside the render'});
    } catch (err) {
      caught = err;
    }
  });

  setTimeout(() => {
    t.ok(caught, 'it throws rather than recursing');
    t.equal(
      caught.message,
      "can't update while rendering",
      'saying why'
    );
    t.end();
  }, 50);
});

test('a render that throws does not stop the loop', (t) => {
  const errors = [];
  const realError = console.error;
  console.error = (err) => errors.push(err);

  let calls = 0;
  const loop = RenderLoop({first: true}, () => {
    calls += 1;
    throw new Error('a widget blew up');
  });

  setTimeout(() => {
    loop.update({second: true});
    setTimeout(() => {
      console.error = realError;
      t.equal(calls, 2, 'the next update still draws');
      t.equal(errors.length, 2, 'and the failures were reported');
      t.end();
    }, 50);
  }, 50);
});
