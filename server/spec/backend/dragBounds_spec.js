'use strict';

const test = require('tape');

const {slide, MARGIN} = require('../../src/dragBounds');

const SCREEN = {width: 1000, height: 800};
const box = (left, top, width, height) => ({left, top, width, height});

test('a drag with nothing in the way goes where the pointer asks', (t) => {
  const result = slide(box(0, 0, 100, 100), {left: 400, top: 300}, [], SCREEN, MARGIN);

  t.deepEqual(
    {left: result.left, top: result.top},
    {left: 400, top: 300},
    'straight there'
  );
  t.deepEqual(result.blocked, {x: false, y: false}, 'nothing stopped it');
  t.end();
});

test('dragging into a widget stops at its edge', (t) => {
  const wall = box(300, 0, 100, 100);
  const result = slide(box(0, 0, 100, 100), {left: 900, top: 0}, [wall], SCREEN, 12);

  t.equal(result.left, 300 - 100 - 12, 'up against it, margin kept');
  t.ok(result.blocked.x, 'and it says it was stopped');
  t.end();
});

test('dragging the other way stops at the other edge', (t) => {
  const wall = box(0, 0, 100, 100);
  const result = slide(box(300, 0, 100, 100), {left: 0, top: 0}, [wall], SCREEN, 12);

  t.equal(result.left, 100 + 12, 'stopped on the far side of it');
  t.end();
});

test('a pointer that leaps across the screen still stops at the first thing', (t) => {
  const near = box(200, 0, 60, 100);
  const far = box(600, 0, 60, 100);
  const result = slide(box(0, 0, 100, 100), {left: 999, top: 0}, [near, far], SCREEN, 12);

  t.equal(result.left, 200 - 100 - 12, 'the near one, not through it to the far one');
  t.end();
});

test('a small widget cannot be jumped over', (t) => {
  const pebble = box(150, 40, 10, 10);
  const result = slide(box(0, 0, 100, 100), {left: 800, top: 0}, [pebble], SCREEN, 12);

  t.equal(result.left, 150 - 100 - 12, 'stopped by something far smaller than the step');
  t.end();
});

test('dragging along a widget slides rather than sticking', (t) => {
  const wall = box(300, 0, 100, 400);
  // hard right and a little down: across is blocked, down is not
  const result = slide(box(0, 0, 100, 100), {left: 900, top: 60}, [wall], SCREEN, 12);

  t.equal(result.left, 300 - 100 - 12, 'held at the wall');
  t.equal(result.top, 60, 'but free to move down its face');
  t.end();
});

test('dragging past the end of a widget goes around it', (t) => {
  const wall = box(300, 0, 100, 100);
  const result = slide(box(0, 0, 100, 100), {left: 600, top: 300}, [wall], SCREEN, 12);

  t.deepEqual(
    {left: result.left, top: result.top},
    {left: 600, top: 300},
    'clear of it vertically, so across is open'
  );
  t.end();
});

test('a widget already overlapping can still be dragged out', (t) => {
  const other = box(50, 0, 100, 100);
  const result = slide(box(0, 0, 100, 100), {left: 400, top: 0}, [other], SCREEN, 12);

  t.equal(result.left, 400, 'not pinned in place by what it is already inside');
  t.end();
});

test('a drag stays on the screen', (t) => {
  const result = slide(box(0, 0, 100, 100), {left: 5000, top: 5000}, [], SCREEN, 12);

  t.deepEqual(
    {left: result.left, top: result.top},
    {left: 900, top: 700},
    'held at the far corner'
  );
  t.end();
});

test('a corner between two widgets is squeezed into, not snagged on', (t) => {
  const right = box(300, 0, 100, 200);
  const below = box(0, 300, 200, 100);
  const result = slide(box(0, 0, 100, 100), {left: 900, top: 900}, [right, below], SCREEN, 12);

  t.ok(result.left <= 300 - 100 - 12 || result.top <= 300 - 100 - 12, 'one axis gave way');
  t.ok(
    result.left + 100 <= right.left - 12 ||
      result.top >= right.top + right.height + 12,
    'and it is clear of the one on the right'
  );
  t.end();
});

test('the margin is the one the arranging uses', (t) => {
  t.equal(MARGIN, 12, 'so a drag cannot leave widgets closer than they will be left');
  t.end();
});
