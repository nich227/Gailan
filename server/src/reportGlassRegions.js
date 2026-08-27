//
//  reportGlassRegions.js
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

// A widget cannot reach what is behind the window: the compositor puts the
// desktop there after the page has drawn. So a widget marks the area it wants
// glassed, and the app asks the system to draw glass behind exactly that
// rectangle. This reports those rectangles whenever they change.

const MARKER = '[data-gailan-desktop-glass]';

let lastSent = '';

function collect() {
  const regions = [];
  document.querySelectorAll(MARKER).forEach((el, index) => {
    const box = el.getBoundingClientRect();
    if (box.width < 1 || box.height < 1) return;
    const radius = parseFloat(
      el.dataset.gailanDesktopGlass ||
        window.getComputedStyle(el).borderTopLeftRadius
    );
    regions.push({
      // the element's own id when it has one, so a widget that re-renders
      // keeps the same glass view instead of getting a new one
      id: el.id || `glass-${index}`,
      x: Math.round(box.left),
      y: Math.round(box.top),
      w: Math.round(box.width),
      h: Math.round(box.height),
      radius: isNaN(radius) ? 0 : radius,
    });
  });
  return regions;
}

function send() {
  const handler =
    window.webkit &&
    window.webkit.messageHandlers &&
    window.webkit.messageHandlers.gailan;
  if (!handler) return;

  const regions = collect();
  const serialized = JSON.stringify(regions);
  if (serialized === lastSent) return;
  lastSent = serialized;
  handler.postMessage({type: 'glassRegions', regions: regions});
}

// after a render, and whenever the layout could have moved underneath us
module.exports = function reportGlassRegions() {
  requestAnimationFrame(send);
};

module.exports.watch = function watchGlassRegions() {
  window.addEventListener('resize', () => requestAnimationFrame(send));
  new MutationObserver(() => requestAnimationFrame(send)).observe(
    document.body,
    {attributes: true, childList: true, subtree: true}
  );
};
