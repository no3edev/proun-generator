import { palettes } from '../../src/palette/palettes.js';
import { splitPalette } from '../../src/generator/strategies/common.js';
/** the lightest neutral of a palette (what Mass uses for a pale backdrop) */
export const lightestOf = (name) => { const n = splitPalette(palettes[name]).neutrals; return n[n.length - 1]; };

// The twelve Library presets: what each is after, and the generator settings the seed search starts from (strategy, orientation, palette, how many
// of each shape type). The search (search.mjs) then looks for the seed whose layout is closest to the reference's composition.
export const SPECS = [
  { id: 'cracked-grey', title: 'Floating blocks on pale ground', after: 'a Proun on a cracked grey ground (blocks in the upper centre, small marks at the far edges)', strategy: 'central-cluster', orientation: 'square', palette: 'Proun — pale graphite',
    counts: { 'cube-fixed': 1, 'cube-variable': 2, plane: 2, rod: 2, circle: 1 } },
  { id: 'ochre-suspension', title: 'Suspension on ochre', after: 'the gouache on ochre paper: a red bar, a white-and-black block, red planes, a sphere hanging on a string', strategy: 'axis-thrust', orientation: 'portrait', palette: 'Proun 99 — ochre suspension',
    counts: { beam: 1, 'cube-fixed': 1, plane: 2, sphere: 1, rod: 2, frame: 1 },
    perType: { sphere: { sizeMin: 0.3, sizeMax: 0.35 }, frame: { sizeMin: 0.7, sizeMax: 0.9 } },
    need: (L) => L.some((e) => e.type === 'sphere' && e.hex === '#ac362a') },
  { id: 'diagonals-19d', title: 'Diagonals with the ochre disc', after: 'Proun 19D: dense diagonal bars, an ochre disc, a dark wedge below', strategy: 'disc-beams', orientation: 'square', palette: 'Proun 19D — wood and slate',
    counts: { circle: 1, beam: 3, plane: 2, 'cube-variable': 2, triangle: 1, rod: 1, segment: 1 } },
  { id: 'grey-cube', title: 'The floating cube', after: 'the grey Proun: a rhombic cube on a dark column, arcs and a perspective grid', strategy: 'central-cluster', orientation: 'portrait', palette: 'Proun — grey ground',
    counts: { 'cube-fixed': 1, plane: 1, circle: 2, rod: 2 } },
  { id: 'crossing-beams', title: 'Crossing beams', after: 'the pale Proun of two huge beams crossing over a block, with floating bars', strategy: 'axis-thrust', orientation: 'portrait', palette: 'Proun — lithograph on cream',
    counts: { beam: 2, 'cube-variable': 2, plane: 1, rod: 1 } },
  { id: 'red-bar', title: 'Red bar and diamond', after: 'the Proun of a tall red bar, a black rectangle, a white crossbar and a diamond outline', strategy: 'axis-thrust', orientation: 'portrait', palette: 'Proun — cream and vermilion',
    counts: { beam: 2, plane: 3, frame: 1, rod: 1 },
    perType: { beam: { snapRotation: true }, plane: { snapRotation: true }, frame: { snapRotation: true }, rod: { snapRotation: true } } },
  { id: 'graphite-box', title: 'Graphite tower block', after: 'the graphite Proun: one large box with a black slot, arcs and dark blades below', strategy: 'central-cluster', orientation: 'square', palette: 'Proun — pale graphite',
    counts: { 'cube-fixed': 1, 'cube-variable': 3, plane: 3, segment: 3, ring: 1, rod: 2 } },
  { id: 'black-disc', title: 'Black disc and plane', after: 'the gouache: a black disc, a grey parallelogram plane, hairline crossbars and a small cross', strategy: 'disc-beams', orientation: 'portrait', palette: 'Proun — gouache on toned paper',
    counts: { circle: 1, plane: 1, beam: 1, 'cube-variable': 1, rod: 3 },
    perType: { plane: { snapRotation: true }, beam: { snapRotation: true }, rod: { snapRotation: true } } },
  { id: 'tall-tower', title: 'The tall tower', after: 'the lithograph of a tall stepped tower rising off the frame, with a floating shadow plane', strategy: 'axis-thrust', orientation: 'portrait', palette: 'Proun — lithograph on cream',
    counts: { beam: 3, plane: 3, 'cube-variable': 2, rod: 2, segment: 1 },
    perType: { beam: { snapRotation: true }, plane: { snapRotation: true }, segment: { snapRotation: true }, rod: { snapRotation: true } } },
  { id: 'long-diagonal', title: 'Long diagonal', after: 'the lithograph of a long beam rising across the sheet with blocks at its left end and a black square', strategy: 'axis-thrust', orientation: 'landscape', palette: 'Proun — lithograph on cream',
    counts: { beam: 3, plane: 2, 'cube-variable': 3, 'cube-fixed': 1, rod: 1 } },
  { id: 'disc-and-boxes', title: 'Disc and boxes', after: 'the lithograph of a great pale disc with a dark square and boxes laid across it', strategy: 'disc-beams', orientation: 'landscape', palette: 'Proun — lithograph on cream',
    counts: { circle: 1, 'cube-variable': 4, plane: 2, beam: 2, rod: 2 } },
  { id: 'figurine', title: 'Figurine study', after: 'a figurine from the Victory over the Sun portfolio (a Proun-like construction: cube, triangle, hemisphere, bars)', strategy: 'central-cluster', orientation: 'portrait', palette: 'Proun — lithograph on cream',
    counts: { 'cube-fixed': 1, triangle: 1, crescent: 1, plane: 2, segment: 1, circle: 1, rod: 2 } },
  // --- the same references under the assembly strategies (Tower, Cross, Mass), to be compared with the picks above ---
  { id: 'tower-tall', target: 'tall-tower', title: 'The tall tower', after: 'the lithograph of a tall stepped tower rising off the frame, with a floating pale plane', strategy: 'tower', orientation: 'portrait', palette: 'Proun — lithograph on cream',
    counts: { 'cube-variable': 1, plane: 1, beam: 1, rod: 1, triangle: 1, circle: 1 } },
  { id: 'cross-red', target: 'red-bar', title: 'Red bar and frame', after: 'the Proun of a tall red bar, a black rectangle, a white crossbar and a diamond outline', strategy: 'cross', orientation: 'portrait', palette: 'Proun — cream and vermilion',
    counts: { beam: 1, plane: 1, 'cube-variable': 1, frame: 1, rod: 1 }, need: (L) => L.some((e) => e.type === 'frame') && !L.some((e) => e.type === 'cube-fixed') },
  { id: 'cross-column', target: 'grey-cube', title: 'The floating cube', after: 'the grey Proun: a cube across a dark column, half discs at the edges', strategy: 'cross', orientation: 'portrait', palette: 'Proun — grey ground',
    counts: { 'cube-fixed': 1, plane: 1, 'cube-variable': 1, circle: 1, triangle: 1, rod: 1 }, need: (L) => L.some((e) => e.type === 'cube-fixed') },
  { id: 'mass-graphite', target: 'graphite-box', title: 'Box with a black slot', after: 'the graphite lithograph with one large box', strategy: 'mass', orientation: 'square', palette: 'Proun — pale graphite',
    counts: { 'cube-variable': 1, plane: 1, beam: 1, rod: 1 }, need: (L) => { const a = L.find((e) => e.role === 'anchor'); return a?.type !== 'circle' && a?.hex === lightestOf('Proun — pale graphite'); } },
  { id: 'mass-long', target: 'long-diagonal', title: 'Long diagonal', after: 'the lithograph of the long rising beam over stepped blocks', strategy: 'mass', orientation: 'landscape', palette: 'Proun — lithograph on cream',
    counts: { 'cube-variable': 1, plane: 1, beam: 1, rod: 1 } },
  { id: 'mass-disc', target: 'disc-and-boxes', title: 'Disc and boxes', after: 'the lithograph of the great pale disc with boxes laid across it', strategy: 'mass', orientation: 'landscape', palette: 'Proun — lithograph on cream',
    counts: { circle: 1, 'cube-variable': 1, plane: 1, beam: 1, rod: 1 }, need: (L) => { const a = L.find((e) => e.role === 'anchor'); return a?.type === 'circle' && a?.hex === lightestOf('Proun — lithograph on cream') && L.some((e) => e.type === 'plane' && e.role === 'support' && e.scale[0] > 6); } }
];
