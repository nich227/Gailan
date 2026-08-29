'use strict';

const test = require('tape');

const {constrainDrag, blockersAround} = require('../../src/constrainDrag');

const SCREEN = {width: 1200, height: 800};

// Same shape of fake as the layout specs: a rect is what the browser reports, so a
// rect is what these stub, offsets included.
function fakeBox(document, id, left, top, width, height) {
  const el = document.createElement('div');
  el.id = id;
  el.__box = {left, top, width, height};
  el.getBoundingClientRect = () => {
    const written = el.getAttribute('data-gailan-offset') || '0,0';
    const [dx, dy] = written.split(',').map(Number);
    return {
      left: el.__box.left + dx,
      top: el.__box.top + dy,
      width: el.__box.width,
      height: el.__box.height,
      right: el.__box.left + dx + el.__box.width,
      bottom: el.__box.top + dy + el.__box.height,
    };
  };
  return el;
}

function screenWith(children) {
  const container = fakeBox(document, 'gailan', 0, 0, SCREEN.width, SCREEN.height);
  Object.defineProperty(container, 'clientWidth', {value: SCREEN.width});
  Object.defineProperty(container, 'clientHeight', {value: SCREEN.height});
  children.forEach((child) => container.appendChild(child));
  document.body.appendChild(container);
  return container;
}

test('the widgets beside this one are what block it', (t) => {
  const dragged = fakeBox(document, 'dragme', 0, 0, 200, 100);
  const other = fakeBox(document, 'other', 400, 0, 200, 100);
  const container = screenWith([dragged, other]);
  const origin = container.getBoundingClientRect();

  const blockers = blockersAround(dragged, container, origin, SCREEN);

  t.equal(blockers.length, 1, 'just the other one');
  t.deepEqual(blockers[0], {left: 400, top: 0, width: 200, height: 100}, 'where it is');
  t.end();
});

test('a widget the arranging moved blocks where it is drawn, not where it asked', (t) => {
  const dragged = fakeBox(document, 'dragme', 0, 0, 200, 100);
  const other = fakeBox(document, 'other', 400, 0, 200, 100);
  // the arranging pushed it further right
  other.setAttribute('data-gailan-offset', '200,0');
  const container = screenWith([dragged, other]);
  const origin = container.getBoundingClientRect();

  const blockers = blockersAround(dragged, container, origin, SCREEN);

  t.equal(blockers[0].left, 600, 'the drawn position is the one that stops you');
  t.end();
});

test('dragging is stopped by a neighbor', (t) => {
  const dragged = fakeBox(document, 'dragme', 0, 0, 200, 100);
  const other = fakeBox(document, 'other', 400, 0, 200, 100);
  const container = screenWith([dragged, other]);

  const result = constrainDrag(dragged, {left: 1000, top: 0});

  t.equal(result.left, 400 - 200 - 12, 'held at its edge');
  t.ok(result.blocked.x, 'and it reports being held');
  t.equal(container.children.length, 2, 'nothing was added or removed');
  t.end();
});

test('a widget inside a wrapper is measured as the wrapper', (t) => {
  const shell = fakeBox(document, 'shell', 0, 0, 200, 100);
  const panel = fakeBox(document, 'panel', 20, 10, 160, 80);
  shell.appendChild(panel);
  const other = fakeBox(document, 'other', 400, 0, 200, 100);
  screenWith([shell, other]);

  // the panel is what gets dragged, but the shell is what sits beside the others
  const blockers = blockersAround(panel, shell.parentElement, {left: 0, top: 0}, SCREEN);

  t.equal(blockers.length, 1, 'its own wrapper is not treated as an obstacle');
  t.equal(blockers[0].left, 400, 'only the neighbor');
  t.end();
});

// The drag is worked out against the screen, but what comes back is written into the
// widget's own coordinates. When the arranging has moved the wrapper, those differ, and
// returning the screen position would shift the widget again on every single drag.
test('the answer is in the coordinates the widget writes into', (t) => {
  const shell = fakeBox(document, 'shell', 0, 0, 340, 450);
  const panel = fakeBox(document, 'panel', 24, 24, 340, 449);
  shell.appendChild(panel);
  // the arranging pushed the whole wrapper down
  shell.setAttribute('data-gailan-offset', '0,276');
  const other = fakeBox(document, 'other', 376, 192, 242, 164);
  const container = screenWith([shell, other]);

  Object.defineProperty(panel, 'offsetParent', {value: shell});

  // asked to go hard right, which the neighbor blocks, and not moved vertically
  const result = constrainDrag(panel, {left: 1200, top: 300});

  t.equal(result.top, 24, 'the same place it already was, not 276 lower');
  t.equal(result.left, 24, 'and held where it was horizontally');
  t.equal(container.children.length, 2, 'nothing disturbed');
  t.end();
});

// A widget that drags its own wrapper, which is the shape the hub widgets use. The
// shift the arranging put on it is in the painted position but not in style.left, so
// leaving it in would move the widget by that much again on every drag.
test('a widget dragging its own wrapper is not shifted by its own offset', (t) => {
  const dragged = fakeBox(document, 'dragme', 24, 24, 242, 156);
  dragged.setAttribute('data-gailan-offset', '0,276');
  const container = screenWith([dragged, fakeBox(document, 'other', 900, 900, 100, 100)]);

  Object.defineProperty(dragged, 'offsetParent', {value: container});

  const result = constrainDrag(dragged, {left: 500, top: 300});

  t.equal(result.top, 300 - 276, 'the offset comes off what is written back');
  t.equal(result.left, 500, 'and across is untouched, since there is no offset there');
  t.end();
});

test('a widget with nothing beside it drags freely', (t) => {
  const dragged = fakeBox(document, 'alone', 0, 0, 200, 100);
  screenWith([dragged]);

  const result = constrainDrag(dragged, {left: 500, top: 400});

  t.deepEqual({left: result.left, top: result.top}, {left: 500, top: 400}, 'as asked');
  t.end();
});

test('blockers can be handed in for a widget that knows better', (t) => {
  const dragged = fakeBox(document, 'dragme', 0, 0, 100, 100);
  screenWith([dragged]);

  const result = constrainDrag(dragged, {left: 500, top: 0}, {
    blockers: [{left: 200, top: 0, width: 50, height: 100}],
    bounds: SCREEN,
  });

  t.equal(result.left, 200 - 100 - 12, 'and those are the ones that stop it');
  t.end();
});
