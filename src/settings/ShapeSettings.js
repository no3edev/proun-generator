import { shapeRegistry } from '../shapes/registry.js';

// Per-type, user-adjustable ranges layered on top of each shape's own
// randomScale() and the shared position bounds:
//
//   count — how many independent instances of this shape exist.
//     Each instance samples its own position/rotation/scale/color
//     from the same size/spread ranges below, so instances of the
//     same type never move in sync or share a color.
//
//   sizeMin/sizeMax — a multiplier applied to whatever randomScale()
//     returns. At the default 1.0–1.0 nothing changes from a shape's
//     authored behavior; widen it to let that shape run bigger or
//     smaller overall while keeping its own character (a stripe stays
//     a stripe, just a longer or shorter one).
//
//   spread — 0..2, multiplies the shared position bounds (see
//     Composition.js). 0 = always at the origin, 1 = the original
//     full-bounds range, 2 = double that range.
//
// visible mirrors Composition's per-instance visibility, kept here so
// the panel has one place to read/write all of a shape's settings.

export const MIN_COUNT = 0;
export const MAX_COUNT = 12; // a soft cap — collision resolution is O(n^2)-ish per advance

function defaultsFor() {
  return { visible: true, sizeMin: 1.0, sizeMax: 1.0, spread: 1.0, count: 1 };
}

const settings = {};
shapeRegistry.forEach((s) => { settings[s.type] = defaultsFor(); });

function clampSpread(v) {
  return Math.max(0, Math.min(2, v));
}

function clampCount(v) {
  return Math.max(MIN_COUNT, Math.min(MAX_COUNT, Math.round(v)));
}

export const ShapeSettings = {
  get(type) {
    return settings[type];
  },

  setSizeRange(type, min, max) {
    const s = settings[type];
    if (!s) return;
    // keep min <= max so the sampling range is never inverted
    s.sizeMin = Math.max(0.01, Math.min(min, max));
    s.sizeMax = Math.max(0.01, Math.max(min, max));
  },

  setSpread(type, value) {
    const s = settings[type];
    if (!s) return;
    s.spread = clampSpread(value);
  },

  setVisible(type, visible) {
    const s = settings[type];
    if (!s) return;
    s.visible = visible;
  },

  setCount(type, count) {
    const s = settings[type];
    if (!s) return;
    s.count = clampCount(count);
  },

  randomSizeMultiplier(type) {
    const s = settings[type];
    if (!s) return 1;
    return s.sizeMin + Math.random() * (s.sizeMax - s.sizeMin);
  }
};
