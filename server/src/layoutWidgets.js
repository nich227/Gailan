'use strict';

// Measures the widgets on a screen and moves the ones that overlap, then watches for
// any of them changing size so it can do it again.
//
// The move is a transform rather than a change to top and left, so a widget's own
// placement is left alone: clear the transform and it is back where its author put it,
// which is also what makes this safe to run over and over.

const {pack} = require('./packWidgets');

const OFFSET = 'data-gailan-offset';

function idOf(el) {
  return el.id || el.getAttribute('data-widget-id') || '';
}

// Where the widget is actually painted, relative to the screen it is painted on.
//
// offsetLeft and offsetTop were the obvious choice and were wrong: they are measured
// against the nearest positioned ancestor and read zero when there is not one, so every
// widget looked as though it sat in the corner, the packing decided they all overlapped,
// and it stacked them there. A rect is what the eye sees.
function offsetOn(el) {
  const written = el.getAttribute(OFFSET);
  if (!written) return {dx: 0, dy: 0};

  const parts = written.split(',');
  return {dx: Number(parts[0]) || 0, dy: Number(parts[1]) || 0};
}

// Where the widget asked to be, relative to the screen it is on: where it is painted,
// less whatever this moved it by last time. Taking the offset off rather than clearing
// the transform and measuring again means the arrangement is worked out from the same
// numbers every pass, without a reflow and without restarting an animation inside a
// widget that has not moved.
function boxOf(el, origin) {
  const rect = el.getBoundingClientRect();
  const base = origin || {left: 0, top: 0};
  const {dx, dy} = offsetOn(el);

  return {
    id: idOf(el),
    left: rect.left - base.left - dx,
    top: rect.top - base.top - dy,
    width: rect.width,
    height: rect.height,
  };
}

function isMeasurable(el) {
  const rect = el.getBoundingClientRect();
  return rect.width > 0 && rect.height > 0;
}

function clear(el) {
  if (el.getAttribute(OFFSET)) {
    el.style.transform = '';
    el.removeAttribute(OFFSET);
  }
}

function apply(el, box, move) {
  if (!move) {
    clear(el);
    return;
  }

  const dx = Math.round(move.left - box.left);
  const dy = Math.round(move.top - box.top);
  const next = dx + ',' + dy;

  // writing the same transform again would restart any animation inside it
  if (el.getAttribute(OFFSET) === next) return;

  el.style.transform = 'translate(' + dx + 'px, ' + dy + 'px)';
  el.setAttribute(OFFSET, next);
}

function layoutWidgets(container, viewport) {
  if (!container) return {};

  const widgets = Array.prototype.filter.call(container.children, isMeasurable);
  if (widgets.length < 2) {
    Array.prototype.forEach.call(container.children, clear);
    return {};
  }

  const origin = container.getBoundingClientRect();
  const boxes = widgets.map((el) => boxOf(el, origin));

  // Every widget reporting the same corner means the measurement failed, not that
  // somebody placed them all in one spot. Stacking them would then be an invention,
  // and leaving them alone is the smaller mistake.
  const distinct = new Set(boxes.map((box) => box.left + ':' + box.top));
  if (distinct.size < 2) return {};

  const bounds = viewport || {
    width: container.clientWidth || origin.width,
    height: container.clientHeight || origin.height,
  };

  const moves = pack(boxes, bounds);
  widgets.forEach((el, i) => apply(el, boxes[i], moves[boxes[i].id]));

  return moves;
}

/**
 * Lays the widgets out now, and again whenever one of them changes size or the screen
 * does. Returns a function that stops watching.
 */
function watchWidgets(container, window) {
  if (!container || !window) return () => {};

  let pending = false;
  const run = () => {
    pending = false;
    layoutWidgets(container);
  };
  const schedule = () => {
    if (pending) return;
    pending = true;
    if (window.requestAnimationFrame) window.requestAnimationFrame(run);
    else run();
  };

  let sizes = null;
  if (window.ResizeObserver) {
    sizes = new window.ResizeObserver(schedule);
    Array.prototype.forEach.call(container.children, (el) => sizes.observe(el));
  }

  // a widget arriving or leaving changes the arrangement as much as one resizing
  let children = null;
  if (window.MutationObserver) {
    children = new window.MutationObserver((records) => {
      if (sizes) {
        records.forEach((record) => {
          Array.prototype.forEach.call(record.addedNodes, (node) => {
            if (node.nodeType === 1) sizes.observe(node);
          });
        });
      }
      schedule();
    });
    children.observe(container, {childList: true});
  }

  window.addEventListener('resize', schedule);
  schedule();

  return () => {
    if (sizes) sizes.disconnect();
    if (children) children.disconnect();
    window.removeEventListener('resize', schedule);
  };
}

module.exports = {layoutWidgets, watchWidgets, boxOf};
