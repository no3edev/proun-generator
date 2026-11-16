// The Library presets, as curated: which seed of which spec (specs.mjs) was chosen for each reference, and what to say about it.
// `node tools/presets/build_library.mjs` turns these into src/presets/library.js and presets/proun-library.json.
import { SPECS } from './specs.mjs';

const ALL_TYPES = ['circle', 'sphere', 'triangle', 'crescent', 'segment', 'frame', 'ring', 'cube-fixed', 'cube-variable', 'plane', 'rod', 'beam'];

const CHOSEN = [
  // [spec id (specs.mjs), seed, name, note]
  ['cracked-grey', 8439, 'Floating blocks on pale ground', 'Close: the dark plane behind a grey slab, the white bar, the small marks at the far edges and the low pair of blocks.'],
  ['ochre-suspension', 8972, 'Suspension on ochre', 'Loose: the red sphere, the grey diagonal beam and the outline frame on ochre; the hanging string and the white block are not reproduced.'],
  ['diagonals-19d', 7690, 'Diagonals with the ochre disc', 'Sparser than the dense original: the ochre disc, a dark crescent, the diagonal bars.'],
  ['cross-column', 9160, 'The floating cube', 'Close: a cube across a tall dark column, thin red lines and a wide low triangle for the ground; the arcs and the grid are not reproduced.'],
  ['crossing-beams', 1437, 'Crossing beams', 'Beams crossing a large block with floating bars; the original is paler and more massive.'],
  ['cross-red', 7284, 'Red bar and frame', 'Close: the tall red bar, the black rectangle, grey planes at both ends, the crossbar, the diamond outline and a hairline, all upright as in the original.'],
  ['mass-graphite', 9099, 'Great box on a turned grid', 'A pale turned slab with a dark box and a lighter block on it, a long bar along its edge and a pair of blocks below; the drawing\'s arcs and fine lines are not reproduced.'],
  ['black-disc', 487, 'Black disc and plane', 'Close in spirit: a large black disc crossed by a pale plane, and a small disc; the hairline crossbars are missing.'],
  ['mass-long', 7359, 'Long diagonal', 'A stepped dark mass crossed by a long rising beam, with a pair of blocks below; the original is horizontal and denser.'],
  ['mass-disc', 4740, 'Disc and boxes', 'Close: a pale disc on a dark framed field with a dark assembly of boxes laid across it and a long rising beam; the hatching and the fine ribs are not reproduced.'],
  ['tower-tall', 6537, 'The tall tower', 'A stepped upright tower leaving the frame, a pale plane floating beside it with a small bar, and long hairlines; plainer than the lithograph.']
];

/** @type {{ id: string, specId: string, ref: string, name: string, after: string, note: string, patch: any }[]} */
export const ENTRIES = CHOSEN.map(([specId, seed, name, note]) => {
  const spec = SPECS.find((s) => s.id === specId);
  const shapes = {};
  for (const t of ALL_TYPES) shapes[t] = { visible: true, count: spec.counts[t] || 0, ...((spec.perType || {})[t] || {}) };
  return {
    id: `library-${specId}`, specId, ref: spec.target || spec.id, name, after: spec.after, note,
    patch: { seed, palette: spec.palette, orientation: spec.orientation, composition: { strategy: spec.strategy }, shapes }
  };
});
