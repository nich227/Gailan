'use strict';

// Measures the widgets on a screen and moves the ones that overlap, then watches for
// any of them changing size so it can do it again.
//
// The move is a transform rather than a change to top and left, so a widget's own
// placement is left alone: clear the transform and it is back where its author put it,
// which is also what makes this safe to run over and over.

const {pack} = require('./packWidgets');

const OFFSET = 'data-gailan-offset';

function boxOf(el) {
  // offsetLeft and offsetTop are the position the widget asked for, before any
  // transform this has applied, which is what the packing has to work from
  return {
    id: el.id || el.getAttribute('data-widget-id') || '',
    left: el.offsetLeft,
    top: el.offsetTop,
    width: el.offsetWidth,
    height: el.offsetHeight,
  };
}

function isMeasurable(el) {
  return el.offsetWidth > 0 && el.offsetHeight > 0;
}

function apply(el, move) {
  if (!move) {
    if (el.getAttribute(OFFSET)) {
      el.style.transform = '';
      el.removeAttribute(OFFSET);
    }
    return;
  }

  const dx = Math.round(move.left - el.offsetLeft);
  const dy = Math.round(move.top - el.offsetTop);
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
    Array.prototype.forEach.call(container.children, (el) => apply(el, null));
    return {};
  }

  const bounds = viewport || {
    width: container.clientWidth,
    height: container.clientHeight,
  };

  const moves = pack(widgets.map(boxOf), bounds);
  widgets.forEach((el) => apply(el, moves[boxOf(el).id]));

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
