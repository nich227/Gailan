'use strict';

// Widgets say where they want to sit, and nothing stops two of them wanting the same
// place. A widget that changes size, a clock switching from numerals to a dial, grows
// into whatever is under it.
//
// This works out where they should actually go: the one nearest the top left keeps its
// place, and anything overlapping it moves down, then across when it runs out of room,
// then stays on the screen even if that means sitting where it was asked not to. The
// geometry is separate from the page so it can be reasoned about and tested without a
// browser.

const MARGIN = 12;

function overlaps(a, b, margin) {
  return (
    a.left < b.left + b.width + margin &&
    a.left + a.width + margin > b.left &&
    a.top < b.top + b.height + margin &&
    a.top + a.height + margin > b.top
  );
}

// Reading order, so the arrangement does not depend on which widget happened to load
// first. Ties go to whichever id sorts first, which keeps it stable between runs.
function inReadingOrder(boxes) {
  return boxes.slice().sort((a, b) => {
    if (a.top !== b.top) return a.top - b.top;
    if (a.left !== b.left) return a.left - b.left;
    return String(a.id).localeCompare(String(b.id));
  });
}

/**
 * @param boxes  [{id, left, top, width, height}] where each widget asked to be
 * @param bounds {width, height} of the screen it has to fit on
 * @param margin gap to leave between two widgets, in pixels
 * @returns {[id]: {left, top}} for every widget that has to move
 */
function pack(boxes, bounds, margin) {
  const gap = typeof margin === 'number' ? margin : MARGIN;
  const room = {
    width: (bounds && bounds.width) || 0,
    height: (bounds && bounds.height) || 0,
  };

  const placed = [];
  const moves = {};

  inReadingOrder(boxes).forEach((box) => {
    let left = box.left;
    let top = box.top;
    let settled = false;

    // Down past whatever is in the way, and across to a fresh column when there is no
    // more room below. Bounded by the number of widgets, since each pass either clears
    // everything already placed or starts a new column.
    for (let attempt = 0; attempt <= placed.length + 1; attempt += 1) {
      const collision = placed.find((other) =>
        overlaps({left, top, width: box.width, height: box.height}, other, gap)
      );

      if (!collision) {
        settled = true;
        break;
      }

      const below = collision.top + collision.height + gap;

      if (room.height && below + box.height > room.height) {
        // no room underneath, so start again at the top of the next column across
        left = collision.left + collision.width + gap;
        top = box.top;
      } else {
        top = below;
      }

      // Off the side means there is nowhere left to put it. Pulling it back on screen
      // here would drop it on top of whatever is already there, which is the overlap
      // this is supposed to remove, so it stays where its author asked instead.
      if (room.width && left + box.width > room.width) break;
    }

    if (!settled) {
      left = box.left;
      top = box.top;
    }

    // On the screen, but only when that does not undo the work above
    const clampedLeft = room.width
      ? Math.max(0, Math.min(left, room.width - box.width))
      : Math.max(0, left);
    const clampedTop = room.height
      ? Math.max(0, Math.min(top, room.height - box.height))
      : Math.max(0, top);

    const clashesAfterClamping = placed.some((other) =>
      overlaps(
        {left: clampedLeft, top: clampedTop, width: box.width, height: box.height},
        other,
        gap
      )
    );

    if (!clashesAfterClamping) {
      left = clampedLeft;
      top = clampedTop;
    }

    if (left !== box.left || top !== box.top) {
      moves[box.id] = {left, top};
    }

    placed.push({
      id: box.id,
      left,
      top,
      width: box.width,
      height: box.height,
    });
  });

  return moves;
}

module.exports = {pack, overlaps, MARGIN};
