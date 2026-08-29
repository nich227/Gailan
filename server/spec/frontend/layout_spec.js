'use strict';

const test = require('tape');

const {pack, overlaps} = require('../../src/packWidgets');
const {layoutWidgets, watchWidgets, boxOf} = require('../../src/layoutWidgets');

const SCREEN = {width: 1440, height: 900};

function box(id, left, top, width, height) {
  return {id, left, top, width, height};
}

// MARK: - the geometry

test('two widgets that do not touch are left where they are', (t) => {
  const moves = pack(
    [box('a', 20, 20, 200, 100), box('b', 400, 400, 200, 100)],
    SCREEN
  );
  t.deepEqual(moves, {}, 'nothing to do');
  t.end();
});

test('a widget sitting on another is pushed below it', (t) => {
  const moves = pack(
    [box('a', 20, 20, 200, 100), box('b', 40, 60, 200, 100)],
    SCREEN
  );
  t.deepEqual(Object.keys(moves), ['b'], 'the lower one gives way');
  t.equal(moves.b.top, 20 + 100 + 12, 'clear of the first, by the margin');
  t.equal(moves.b.left, 40, 'and stays in its column');
  t.end();
});

test('the widget nearest the top left keeps its place', (t) => {
  const moves = pack(
    [box('late', 40, 60, 200, 100), box('early', 20, 20, 200, 100)],
    SCREEN
  );
  t.notOk(moves.early, 'the one above stays');
  t.ok(moves.late, 'the one below moves');
  t.end();
});

test('a widget that grows pushes the next one further down', (t) => {
  const small = pack(
    [box('a', 20, 20, 200, 100), box('b', 20, 140, 200, 100)],
    SCREEN
  );
  t.deepEqual(small, {}, 'they fit while the first is small');

  const grown = pack(
    [box('a', 20, 20, 200, 300), box('b', 20, 140, 200, 100)],
    SCREEN
  );
  t.equal(grown.b.top, 20 + 300 + 12, 'and b is below the grown one');
  t.end();
});

test('three in a stack each clear the one above', (t) => {
  const moves = pack(
    [
      box('a', 20, 20, 200, 100),
      box('b', 20, 30, 200, 100),
      box('c', 20, 40, 200, 100),
    ],
    SCREEN
  );
  t.equal(moves.b.top, 132, 'b below a');
  t.equal(moves.c.top, 244, 'c below b');
  t.end();
});

test('when there is no room below, the next column is used', (t) => {
  const moves = pack(
    [box('tall', 20, 20, 200, 800), box('other', 30, 40, 200, 200)],
    SCREEN
  );
  t.equal(moves.other.left, 20 + 200 + 12, 'across, since below would fall off');
  t.equal(moves.other.top, 40, 'back to the height it asked for');
  t.end();
});

test('nothing is pushed off the screen', (t) => {
  const moves = pack(
    [box('a', 20, 700, 200, 150), box('b', 20, 720, 200, 150)],
    SCREEN
  );
  t.ok(moves.b.top + 150 <= SCREEN.height, 'still on the screen');
  t.ok(moves.b.top >= 0, 'and not above it');
  t.end();
});

test('a widget wider than the screen is pinned to the left rather than hidden', (t) => {
  const moves = pack([box('a', 400, 10, 2000, 100), box('b', 420, 20, 200, 100)], {
    width: 1000,
    height: 900,
  });
  t.equal(moves.a.left, 0, 'as far left as it goes');
  t.end();
});

test('the arrangement does not depend on the order it was given in', (t) => {
  const boxes = [
    box('a', 20, 20, 200, 100),
    box('b', 30, 40, 200, 100),
    box('c', 25, 30, 200, 100),
  ];
  const forwards = pack(boxes, SCREEN);
  const backwards = pack(boxes.slice().reverse(), SCREEN);
  t.deepEqual(forwards, backwards, 'same answer either way');
  t.end();
});

test('running it again on its own answer changes nothing', (t) => {
  const boxes = [box('a', 20, 20, 200, 100), box('b', 40, 60, 200, 100)];
  const first = pack(boxes, SCREEN);

  const settled = boxes.map((b) =>
    first[b.id] ? Object.assign({}, b, first[b.id]) : b
  );
  t.deepEqual(pack(settled, SCREEN), {}, 'it has settled');
  t.end();
});

test('one widget on its own is never moved', (t) => {
  t.deepEqual(pack([box('only', 900, 800, 200, 100)], SCREEN), {});
  t.end();
});

test('a screen of no known size still separates them', (t) => {
  const moves = pack([box('a', 0, 0, 100, 100), box('b', 0, 10, 100, 100)], {});
  t.equal(moves.b.top, 112, 'the margin is all it needs');
  t.end();
});

test('the margin can be set', (t) => {
  const moves = pack(
    [box('a', 0, 0, 100, 100), box('b', 0, 10, 100, 100)],
    SCREEN,
    40
  );
  t.equal(moves.b.top, 140, 'a wider gap');
  t.end();
});

test('overlaps counts the margin, and touching edges as clear', (t) => {
  const a = box('a', 0, 0, 100, 100);
  t.ok(overlaps(a, box('b', 50, 50, 100, 100), 0), 'over it');
  t.notOk(overlaps(a, box('b', 200, 0, 100, 100), 0), 'well clear');
  t.ok(overlaps(a, box('b', 105, 0, 100, 100), 12), 'inside the margin');
  t.notOk(overlaps(a, box('b', 120, 0, 100, 100), 12), 'outside it');
  t.end();
});

// MARK: - the page

// jsdom lays nothing out, so every rect is supplied. The size can be changed later,
// which is how a widget growing is described to the layout.
function fakeWidget(doc, id, left, top, width, height) {
  const el = doc.createElement('div');
  el.id = id;
  el.__box = {left, top, width, height};
  el.getBoundingClientRect = () => {
    // a transform moves what is painted, which is what a rect reports
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

function screenWith(widgets) {
  const container = document.createElement('div');
  Object.defineProperties(container, {
    clientWidth: {get: () => SCREEN.width},
    clientHeight: {get: () => SCREEN.height},
  });
  container.getBoundingClientRect = () => ({
    left: 0,
    top: 0,
    width: SCREEN.width,
    height: SCREEN.height,
    right: SCREEN.width,
    bottom: SCREEN.height,
  });
  widgets.forEach((el) => container.appendChild(el));
  return container;
}

test('a widget in the way is moved with a transform', (t) => {
  const a = fakeWidget(document, 'a', 20, 20, 200, 100);
  const b = fakeWidget(document, 'b', 40, 60, 200, 100);
  const container = screenWith([a, b]);

  layoutWidgets(container);

  t.equal(a.style.transform, '', 'the first is left alone');
  t.equal(b.style.transform, 'translate(0px, 72px)', 'the second is nudged down');
  t.equal(b.getAttribute('data-gailan-offset'), '0,72', 'and it remembers by how much');
  t.end();
});

test('a widget no longer in the way has its transform taken off', (t) => {
  const a = fakeWidget(document, 'a', 20, 20, 200, 100);
  const b = fakeWidget(document, 'b', 40, 60, 200, 100);
  const container = screenWith([a, b]);
  layoutWidgets(container);
  t.ok(b.style.transform, 'moved to begin with');

  // the first one shrinks out of the way
  a.__box.height = 10;
  layoutWidgets(container);
  t.equal(b.style.transform, '', 'and put back');
  t.notOk(b.getAttribute('data-gailan-offset'), 'with nothing remembered');
  t.end();
});

test('the same offset is not written twice', (t) => {
  const a = fakeWidget(document, 'a', 20, 20, 200, 100);
  const b = fakeWidget(document, 'b', 40, 60, 200, 100);
  const container = screenWith([a, b]);

  layoutWidgets(container);
  const written = b.style.transform;

  // a valid value, since jsdom throws out css it cannot parse and would leave this
  // empty whether the code touched it or not
  const sentinel = 'translate(9px, 9px)';
  b.style.transform = sentinel;
  layoutWidgets(container);
  t.equal(b.style.transform, sentinel, 'left as it was, since nothing changed');
  t.equal(written, 'translate(0px, 72px)', 'and the first pass did the work');
  t.end();
});

test('a widget of no size yet is ignored', (t) => {
  const a = fakeWidget(document, 'a', 20, 20, 200, 100);
  const empty = fakeWidget(document, 'empty', 300, 300, 0, 0);
  const container = screenWith([a, empty]);

  t.deepEqual(layoutWidgets(container), {}, 'nothing to arrange');
  t.equal(a.style.transform, '', 'and the one with size is untouched');
  t.end();
});

test('a screen with one widget clears any offset left over', (t) => {
  const only = fakeWidget(document, 'only', 20, 20, 200, 100);
  only.style.transform = 'translate(0px, 40px)';
  only.setAttribute('data-gailan-offset', '0,40');
  const container = screenWith([only]);

  layoutWidgets(container);
  t.equal(only.style.transform, '', 'back where it asked to be');
  t.end();
});

test('no container is not an error', (t) => {
  t.deepEqual(layoutWidgets(null), {});
  t.end();
});

test('boxOf reads where the widget is painted', (t) => {
  const el = fakeWidget(document, 'a', 5, 6, 7, 8);
  t.deepEqual(boxOf(el), {id: 'a', left: 5, top: 6, width: 7, height: 8});
  t.end();
});

test('boxOf reads relative to the screen it is on', (t) => {
  const el = fakeWidget(document, 'a', 105, 206, 7, 8);
  t.deepEqual(boxOf(el, {left: 100, top: 200}), {
    id: 'a',
    left: 5,
    top: 6,
    width: 7,
    height: 8,
  });
  t.end();
});

// This is the shape of the bug that put every widget in the corner: the measurement
// came back as zero for all of them, they looked like one pile, and the packing
// helpfully stacked the pile.
test('widgets that all measure the same spot are left alone', (t) => {
  const a = fakeWidget(document, 'a', 0, 0, 200, 100);
  const b = fakeWidget(document, 'b', 0, 0, 200, 100);
  const c = fakeWidget(document, 'c', 0, 0, 200, 100);
  const container = screenWith([a, b, c]);

  t.deepEqual(layoutWidgets(container), {}, 'nothing is moved');
  t.equal(a.style.transform, '', 'a untouched');
  t.equal(b.style.transform, '', 'b untouched');
  t.equal(c.style.transform, '', 'c untouched');
  t.end();
});

test('boxOf falls back to the widget id attribute', (t) => {
  const el = fakeWidget(document, '', 0, 0, 1, 1);
  el.removeAttribute('id');
  el.setAttribute('data-widget-id', 'named');
  t.equal(boxOf(el).id, 'named');
  t.end();
});

// MARK: - watching

test('watching lays out now and again when a widget resizes', (t) => {
  const a = fakeWidget(document, 'a', 20, 20, 200, 100);
  const b = fakeWidget(document, 'b', 40, 60, 200, 100);
  const container = screenWith([a, b]);

  let observed = 0;
  let onResize = null;
  const fakeWindow = {
    requestAnimationFrame: (f) => f(),
    addEventListener: (name, f) => {
      if (name === 'resize') onResize = f;
    },
    removeEventListener: () => {},
    ResizeObserver: class {
      constructor(callback) {
        this.callback = callback;
      }
      observe() {
        observed += 1;
      }
      disconnect() {
        observed = -1;
      }
    },
  };

  const stop = watchWidgets(container, fakeWindow);
  t.equal(observed, 2, 'both widgets are watched');
  t.equal(b.style.transform, 'translate(0px, 72px)', 'and laid out at once');

  b.style.transform = '';
  b.removeAttribute('data-gailan-offset');
  onResize();
  t.equal(b.style.transform, 'translate(0px, 72px)', 'a resize lays them out again');

  stop();
  t.equal(observed, -1, 'and stopping lets go');
  t.end();
});

test('watching works on a window with no observers at all', (t) => {
  const a = fakeWidget(document, 'a', 20, 20, 200, 100);
  const b = fakeWidget(document, 'b', 40, 60, 200, 100);
  const container = screenWith([a, b]);

  const stop = watchWidgets(container, {
    addEventListener: () => {},
    removeEventListener: () => {},
  });
  t.equal(b.style.transform, 'translate(0px, 72px)', 'still laid out');
  stop();
  t.end();
});

test('a widget added later is watched too', (t) => {
  const a = fakeWidget(document, 'a', 20, 20, 200, 100);
  const container = screenWith([a]);

  let observed = 0;
  let onChildren = null;
  const stop = watchWidgets(container, {
    requestAnimationFrame: (f) => f(),
    addEventListener: () => {},
    removeEventListener: () => {},
    ResizeObserver: class {
      observe() {
        observed += 1;
      }
      disconnect() {}
    },
    MutationObserver: class {
      constructor(callback) {
        onChildren = callback;
      }
      observe() {}
      disconnect() {}
    },
  });

  t.equal(observed, 1, 'the one already there');

  const b = fakeWidget(document, 'b', 40, 60, 200, 100);
  container.appendChild(b);
  onChildren([{addedNodes: [b, document.createTextNode('noise')]}]);

  t.equal(observed, 2, 'and the new one, ignoring anything that is not an element');
  t.equal(b.style.transform, 'translate(0px, 72px)', 'laid out on arrival');
  stop();
  t.end();
});

test('watching nothing is not an error', (t) => {
  t.equal(typeof watchWidgets(null, {}), 'function');
  t.equal(typeof watchWidgets(document.createElement('div'), null), 'function');
  t.end();
});
