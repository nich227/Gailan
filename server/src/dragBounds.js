//
//  dragBounds.js
//  Gailan
//
//  Stopping a dragged widget at the edge of another one.
//
//  The obvious approach is to test where the pointer wants the widget and push it
//  back out of anything it landed in, along whichever axis it is least buried. That
//  is the shortest-axis method, and it is the reason dragged boxes in games snag on
//  corners and pop around the wrong side of a wall: which axis is shallowest changes
//  from frame to frame. It also lets a fast drag jump clean through a small widget,
//  since only the destination is examined and never the path.
//
//  So each axis is handled on its own, and movement is stopped at the first edge in
//  the way rather than corrected afterwards. Sliding along a widget's side then comes
//  out of the geometry instead of being a special case, and a pointer that leaps
//  across the screen still stops at the first thing it meets, because the limit is
//  computed from the edge and not from where the pointer landed.
//
//  Copyright (c) 2026 Kevin Chen.
//
//  Released under the terms of the GNU General Public License as published by
//  the Free Software Foundation, either version 3 of the License, or
//  (at your option) any later version. See <http://www.gnu.org/licenses/> for
//  details.
//
'use strict';

const {MARGIN} = require('./packWidgets');

// Do two spans on the same axis come within gap of each other
function spansMeet(aStart, aSize, bStart, bSize, gap) {
  return aStart < bStart + bSize + gap && bStart < aStart + aSize + gap;
}

// How far left or right the box can go before something stops it. Blockers the box
// already sits inside are ignored: a widget that starts out overlapping would
// otherwise be pinned where it stands, unable to drag its way out.
function limitAcross(box, want, blockers, gap) {
  let left = want;

  blockers.forEach((other) => {
    if (!spansMeet(box.top, box.height, other.top, other.height, gap)) return;

    if (want > box.left) {
      const startsClear = box.left + box.width + gap <= other.left;
      if (startsClear) left = Math.min(left, other.left - box.width - gap);
    } else if (want < box.left) {
      const startsClear = other.left + other.width + gap <= box.left;
      if (startsClear) left = Math.max(left, other.left + other.width + gap);
    }
  });

  return left;
}

function limitDown(box, want, blockers, gap) {
  let top = want;

  blockers.forEach((other) => {
    if (!spansMeet(box.left, box.width, other.left, other.width, gap)) return;

    if (want > box.top) {
      const startsClear = box.top + box.height + gap <= other.top;
      if (startsClear) top = Math.min(top, other.top - box.height - gap);
    } else if (want < box.top) {
      const startsClear = other.top + other.height + gap <= box.top;
      if (startsClear) top = Math.max(top, other.top + other.height + gap);
    }
  });

  return top;
}

function distance(a, b) {
  return Math.abs(a.left - b.left) + Math.abs(a.top - b.top);
}

// One axis has to go first, and at a corner the answer differs depending on which.
// Both orders are cheap with a screen's worth of widgets, so both are tried and the
// one that gets nearest the pointer wins. Nothing has to guess which axis matters.
function slide(box, desired, blockers, bounds, margin) {
  const gap = typeof margin === 'number' ? margin : MARGIN;
  const room = bounds || {};

  // Onto the screen first. Doing this before the blockers means the answer can only
  // ever be pulled back towards where the widget already was, never pushed into
  // something that has already been settled.
  const want = {
    left: room.width
      ? Math.max(0, Math.min(desired.left, room.width - box.width))
      : Math.max(0, desired.left),
    top: room.height
      ? Math.max(0, Math.min(desired.top, room.height - box.height))
      : Math.max(0, desired.top),
  };

  const acrossFirst = (() => {
    const left = limitAcross(box, want.left, blockers, gap);
    const top = limitDown({...box, left}, want.top, blockers, gap);
    return {left, top};
  })();

  const downFirst = (() => {
    const top = limitDown(box, want.top, blockers, gap);
    const left = limitAcross({...box, top}, want.left, blockers, gap);
    return {left, top};
  })();

  const best =
    distance(acrossFirst, want) <= distance(downFirst, want) ? acrossFirst : downFirst;

  return {
    left: best.left,
    top: best.top,
    blocked: {x: best.left !== want.left, y: best.top !== want.top},
  };
}

module.exports = {slide, MARGIN};
