// @ts-check

/**
 * How many instances of each shape type a layout holds. Under the legacy
 * generator that is always the type's configured `count`; under a composition
 * strategy the strategy decides, so the scene sizes its mesh pools from the
 * layout rather than from the config.
 * @param {import('../types.js').LayoutEntry[]} layout
 * @returns {Map<string, number>}
 */
export function layoutCounts(layout) {
  /** @type {Map<string, number>} */
  const counts = new Map();
  layout.forEach((e) => counts.set(e.type, Math.max(counts.get(e.type) || 0, e.index + 1)));
  return counts;
}
