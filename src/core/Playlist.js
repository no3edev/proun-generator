// @ts-check

// The curated sequence (Stage 7.4): the order in which Auto shows a fixed set of items (the Library's presets). Shuffled, and no item
// twice before every item has been shown once; when the round is over it is shuffled again, and the first of the new round is never
// the last of the old one, so the same picture is never shown twice in a row (unless there is only one). DOM-free; the random source
// is injected so the tests are exact.

/**
 * @template T
 * @param {{ items: T[], rng?: () => number }} o
 * @returns {{ next: () => T | null, reset: () => void, remaining: () => number }}
 */
export function createPlaylist({ items, rng = Math.random }) {
  /** @type {number[]} */
  let queue = [];
  /** @type {number | null} */
  let last = null;

  function refill() {
    const order = items.map((_, i) => i);
    for (let i = order.length - 1; i > 0; i--) {            // Fisher-Yates
      const j = Math.floor(rng() * (i + 1));
      [order[i], order[j]] = [order[j], order[i]];
    }
    // the new round must not open with what the old one closed with
    if (order.length > 1 && order[0] === last) { const k = 1 + Math.floor(rng() * (order.length - 1)); [order[0], order[k]] = [order[k], order[0]]; }
    queue = order;
  }

  return {
    next() {
      if (!items.length) return null;
      if (!queue.length) refill();
      const i = /** @type {number} */ (queue.shift());
      last = i;
      return items[i];
    },
    /** A new shuffle at the next call (the order is forgotten, `last` is kept so a repeat is still avoided). */
    reset() { queue = []; },
    remaining: () => queue.length
  };
}
