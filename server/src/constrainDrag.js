//
//  constrainDrag.js
//  Gailan
//
//  What a widget calls while a drag is in progress. It finds the widgets around the
//  one being dragged, measures where they are actually drawn, and answers with the
//  nearest position to the pointer that keeps clear of them.
//
//  Copyright (c) 2026 Kevin Chen.
//
//  Released under the terms of the GNU General Public License as published by
//  the Free Software Foundation, either version 3 of the License, or
//  (at your option) any later version. See <http://www.gnu.org/licenses/> for
//  details.
//
'use strict';

const {slide, MARGIN} = require('./dragBounds');
const {visibleRect} = require('./layoutWidgets');

// The wrapper the app gave this widget, which is what sits beside the other widgets
function widgetShellOf(el) {
  let node = el;

  while (node && node.parentElement) {
    if (node.parentElement.id && /^gailan(-|$)/.test(node.parentElement.id)) return node;
    node = node.parentElement;
  }

  return el;
}

function screenOf(el) {
  const shell = widgetShellOf(el);
  return shell.parentElement || el.ownerDocument.body;
}

// Where the other widgets are drawn, in the same coordinates the drag works in.
// Their painted position is what matters, not the position they asked for: a widget
// the arranging moved down is over there now, and that is what you would collide with.
function blockersAround(el, screen, origin, bounds) {
  const mine = widgetShellOf(el);

  return Array.prototype.filter
    .call(screen.children, (child) => child !== mine && child.nodeType === 1)
    .map((child) => {
      const rect = visibleRect(child, origin, bounds);

      return {
        left: rect.left - origin.left,
        top: rect.top - origin.top,
        width: rect.width,
        height: rect.height,
      };
    })
    .filter((box) => box.width > 0 && box.height > 0);
}

// desired is where the pointer would put the element, in the coordinates the widget
// already uses for style.left and style.top. Returns the nearest allowed position.
function constrainDrag(el, desired, options) {
  const settings = options || {};
  const screen = settings.screen || screenOf(el);
  const origin = screen.getBoundingClientRect();
  const bounds = settings.bounds || {
    width: screen.clientWidth || origin.width,
    height: screen.clientHeight || origin.height,
  };

  const rect = el.getBoundingClientRect();
  const box = {
    left: rect.left - origin.left,
    top: rect.top - origin.top,
    width: rect.width,
    height: rect.height,
  };

  const blockers = settings.blockers || blockersAround(el, screen, origin, bounds);
  const margin = typeof settings.margin === 'number' ? settings.margin : MARGIN;
  const result = slide(box, desired, blockers, bounds, margin);

  // Collisions are worked out against the screen, because that is where the widgets
  // are. What comes back has to be in the coordinates the caller writes, which are
  // measured from whatever box its left and top resolve against. For a widget drawn
  // inside a wrapper the arranging has already moved, those are two different places,
  // and handing back the screen position would move it again by that much on every
  // drag.
  const frame = settings.frame || el.offsetParent;
  const shift = frame ? frame.getBoundingClientRect() : origin;

  return {
    left: result.left + origin.left - shift.left,
    top: result.top + origin.top - shift.top,
    blocked: result.blocked,
  };
}

module.exports = {constrainDrag, blockersAround, MARGIN};
