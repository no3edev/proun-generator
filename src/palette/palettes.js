// Each palette defines the paper/background colour, an ink (the dark
// neutral the shadow planes and the darkest solids lean on) and a set of
// accent colours shapes are drawn from.
//
// Revised against the reference Prouns (v0.11.0): the colours come from
// clustering the paintings, gouaches and lithographs themselves, not from
// memory. Rules the palettes follow (tests/palettes.test.js checks them):
//  - the ground is a warm or cool greige, never a pure white (about L 64-94);
//  - the black is a printer's/painter's black (#0b0c0e-#2a2d2e), never #000000;
//  - at least three neutrals stand clear of the paper, so a scene has a tonal range;
//  - the accents split (see strategies/common.js splitPalette) into at most
//    one or two saturated hues, one of which a scene uses, and neutrals;
//    a palette with none is a deliberate monochrome (the lithographs);
//  - no two palettes are near-duplicates.
// Palettes that were removed or merged keep resolving: see PALETTE_ALIASES.
export const palettes = {
  'Proun — classic': {
    paper: '#e9e4d8',
    ink: '#201d18',
    accents: ['#c1362b', '#8f8a7c', '#3a3a38', '#b7bcb9', '#d8d3c4']
  },
  'Proun — cool grey': {
    paper: '#e3e6e4',
    ink: '#14181c',
    accents: ['#405266', '#8b93a0', '#c7cdd1', '#20242a', '#9c3428']
  },
  // the poster: a near-white ground, a deep red, a hard black and cold greys (distinct from the warm classic by its starkness)
  'Red Wedge — white ground': {
    paper: '#f1f0ec',
    ink: '#1d1c1b',
    accents: ['#b8161f', '#232323', '#585b5c', '#a3a7a7', '#d9dbd8']
  },
  // gouache on ochre paper: a red bar, a brown, a near-black, white and a warm grey
  'Proun 99 — ochre suspension': {
    paper: '#e0c888',
    ink: '#1f140e',
    accents: ['#ac362a', '#5e3322', '#fefefb', '#ab9d8b', '#2a1a12']
  },
  // the yellow-ochre disc, wood bars and slate of the dense diagonal Proun
  'Proun 19D — wood and slate': {
    paper: '#dfddd2',
    ink: '#181919',
    accents: ['#c9a63f', '#77684d', '#898b7d', '#3a3a32', '#b3b2a4']
  },
  // the grey Proun: black and white volumes on a mid-grey ground, thin brick-red lines
  'Proun — grey ground': {
    paper: '#a8a59e',
    ink: '#1c1b1a',
    accents: ['#a9462f', '#343632', '#e3e1de', '#67625b', '#8b8176']
  },
  // a pale neutral-grey ground, graphite and white, no colour at all (the cold scans of the graphite Prouns)
  'Proun — pale graphite': {
    paper: '#d9d9d5',
    ink: '#1c1d1e',
    accents: ['#2a2d2e', '#505252', '#868887', '#aeb0ae', '#fbfbfa']
  },
  // peach-cream ground, vermilion and brick red, printer's black and rose-brown greys (the red Prouns and the book covers)
  'Proun — cream and vermilion': {
    paper: '#efe1ce',
    ink: '#1e1c1a',
    accents: ['#de432d', '#a9332b', '#2c2b29', '#8d7767', '#c9b8a6']
  },
  // the lithographs: warm cream paper, black and a scale of warm greys, no colour
  'Proun — lithograph on cream': {
    paper: '#e4d8bd',
    ink: '#2a2824',
    accents: ['#33302b', '#524e46', '#79746a', '#9d9686', '#bfb6a1']
  },
  // a black gouache disc on toned greige paper
  'Proun — gouache on toned paper': {
    paper: '#c8bfa2',
    ink: '#0d0e10',
    accents: ['#16171a', '#58584f', '#8d8c78', '#e9e3cf', '#a9a690']
  },
  'Wolkenbügel — steel grey': {
    paper: '#d9dad8',
    ink: '#101213',
    accents: ['#4c5a63', '#8e969a', '#233038', '#bcc2c2', '#6b3d34']
  }
};

/**
 * Names that no longer exist and the palette that now answers to them, so old presets, share links, history
 * and saved sessions keep loading (they get the closest remaining palette, not the default).
 */
export const PALETTE_ALIASES = {
  'Proun — warm ochre': 'Proun 99 — ochre suspension',
  'Proun Room — silver interior': 'Proun — pale graphite',
  'The Constructor — halftone grey': 'Proun — gouache on toned paper',
  'For the Voice — book red': 'Proun — cream and vermilion',
  'Pelikan — cream and cobalt': 'Proun — cream and vermilion',
  'Black Square — near-white': 'Proun — classic',
  'USSR Pavilion — poster red': 'Proun — classic',
  'Proun G7 — diagonal blue': 'Proun — cool grey',
  'Kestner Portfolio — flat primary': 'Proun — cream and vermilion'
};

export const DEFAULT_PALETTE = 'Proun — classic';
