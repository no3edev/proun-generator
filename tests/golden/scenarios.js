// The fixed reference scenes of the regression suite. A scenario is a
// (name, palette, config builder, seeds) tuple; layouts.json holds the
// generator's output for every (scenario, seed). Used by golden.test.js and
// tools/golden/update.mjs.
//
// Changing these lists, or regenerating layouts.json, is a deliberate act:
// it means "from now on a seed means something different" and needs the same
// approval as any other change to the seed -> composition mapping.
import { makeConfig, each } from '../helpers/scene.js';

export const SCENARIOS = [
  { name: 'default', palette: 'Proun — classic', seeds: [1, 7, 42, 1234, 99999, 4000000000],
    build: (seed) => makeConfig(seed, each(1)) },
  { name: 'dense', palette: 'Red Wedge — white ground', seeds: [3, 11, 2024],
    build: (seed) => makeConfig(seed, each(3, { rod: 2 })) },
  { name: 'snapped', palette: 'Proun — cool grey', seeds: [5, 17],
    build: (seed) => makeConfig(seed, each(2), { shape: { snapRotation: true } }) },
  { name: 'sizes-spread', palette: 'Kestner Portfolio — flat primary', seeds: [8, 31],
    build: (seed) => makeConfig(seed, each(2), { shape: { sizeMin: 0.5, sizeMax: 2, spread: 1.4 } }) },
  // large shapes: the case where the depth solver used to push shapes past the camera
  { name: 'large', palette: 'Proun — classic', seeds: [13, 77],
    build: (seed) => makeConfig(seed, each(2), { shape: { sizeMin: 2, sizeMax: 3 } }) },

  // --- composition strategies (added in Stage 2.1; the scenes above are the
  // legacy generator and must never change) ---
  { name: 'axis-thrust', palette: 'Proun — classic', seeds: [1, 2, 3, 7, 42, 2024],
    build: (seed) => axis(makeConfig(seed, each(1))) },
  { name: 'axis-thrust-portrait', palette: 'Red Wedge — white ground', seeds: [5, 9],
    build: (seed) => axis(makeConfig(seed, each(1)), 'portrait') },
  { name: 'axis-thrust-rods-snapped', palette: 'Proun — cool grey', seeds: [4, 21],
    build: (seed) => axis(makeConfig(seed, each(1, { rod: 1 }), { shape: { snapRotation: true } }), 'square') },
  { name: 'axis-thrust-few-types', palette: 'Kestner Portfolio — flat primary', seeds: [6, 12],
    build: (seed) => axis(makeConfig(seed, { circle: 1, 'cube-variable': 1, triangle: 1 })) },

  // --- the beam shape (Stage 2.2): off by default, so the scenes above never include it ---
  { name: 'beams-legacy', palette: 'Proun — classic', seeds: [3, 19],
    build: (seed) => makeConfig(seed, { beam: 3, 'cube-fixed': 1, circle: 1 }) },
  { name: 'axis-thrust-beams', palette: 'Proun — classic', seeds: [2, 5, 8, 11],
    build: (seed) => axis(makeConfig(seed, { ...each(1, { beam: 1 }), 'cube-variable': 0, plane: 0 })) },

  // --- the segment and crescent (Stage 2.2): off by default, so none of the scenes above include them ---
  { name: 'flat-forms-legacy', palette: 'Proun — classic', seeds: [4, 15],
    build: (seed) => makeConfig(seed, { segment: 2, crescent: 2, 'cube-fixed': 1 }) },
  { name: 'axis-thrust-flat-forms', palette: 'Red Wedge — white ground', seeds: [3, 6, 9, 14, 20],
    build: (seed) => axis(makeConfig(seed, each(1, { segment: 1, crescent: 1 }))) },

  // --- the outline frame and the partial ring (Stage 2.2): off by default, so none of the scenes above include them ---
  { name: 'outlines-legacy', palette: 'Proun — classic', seeds: [5, 18],
    build: (seed) => makeConfig(seed, { frame: 2, ring: 2, 'cube-fixed': 1, circle: 1 }) },
  { name: 'axis-thrust-outlines', palette: 'Proun — classic', seeds: [3, 6, 9, 14, 21],
    build: (seed) => axis(makeConfig(seed, each(1, { frame: 1, ring: 1, segment: 1 }))) },

  // --- the Disc and beams strategy (Stage 2.3) ---
  { name: 'disc-beams', palette: 'Proun — classic', seeds: [1, 2, 3, 5, 8, 13],
    build: (seed) => disc(makeConfig(seed, each(1))) },
  { name: 'disc-beams-portrait', palette: 'Red Wedge — white ground', seeds: [4, 9],
    build: (seed) => disc(makeConfig(seed, each(1)), 'portrait') },
  { name: 'disc-beams-all-shapes', palette: 'Proun — cool grey', seeds: [3, 6, 11],
    build: (seed) => disc(makeConfig(seed, each(1, { rod: 1, beam: 1, segment: 1, crescent: 1, frame: 1, ring: 1 })), 'square') },
  { name: 'disc-beams-few-types', palette: 'Kestner Portfolio — flat primary', seeds: [7],
    build: (seed) => disc(makeConfig(seed, { circle: 1, 'cube-variable': 1 })) },

  // --- the Central cluster strategy (Stage 2.4) ---
  { name: 'central-cluster', palette: 'Proun — classic', seeds: [1, 2, 3, 5, 8, 13],
    build: (seed) => cluster(makeConfig(seed, each(1))) },
  { name: 'central-cluster-portrait', palette: 'Red Wedge — white ground', seeds: [4, 9],
    build: (seed) => cluster(makeConfig(seed, each(1)), 'portrait') },
  { name: 'central-cluster-all-shapes', palette: 'Proun — cool grey', seeds: [3, 6, 11],
    build: (seed) => cluster(makeConfig(seed, each(1, { rod: 1, beam: 1, segment: 1, crescent: 1, frame: 1, ring: 1 })), 'square') },
  { name: 'central-cluster-few-types', palette: 'Kestner Portfolio — flat primary', seeds: [7],
    build: (seed) => cluster(makeConfig(seed, { 'cube-variable': 1, circle: 1 })) }
];

/** the same config under the Central cluster strategy */
function cluster(config, orientation = 'landscape') {
  return { ...config, composition: { strategy: 'central-cluster' }, orientation };
}

/** the same config under the Disc and beams strategy */
function disc(config, orientation = 'landscape') {
  return { ...config, composition: { strategy: 'disc-beams' }, orientation };
}

/** the same config under the Axis thrust strategy */
function axis(config, orientation = 'landscape') {
  return { ...config, composition: { strategy: 'axis-thrust' }, orientation };
}

/** Rounded so the file is stable across platforms (trig differs in the last bits). */
export const DECIMALS = 6;
const r = (n) => Number(n.toFixed(DECIMALS)) + 0;
export const roundEntry = (e) => ({
  type: e.type, index: e.index, hex: e.hex, ...(e.role ? { role: e.role } : {}),
  position: e.position.map(r), rotation: e.rotation.map(r), scale: e.scale.map(r)
});
