import { palettes, DEFAULT_PALETTE } from './palettes.js';

let activeName = DEFAULT_PALETTE;

export const Palette = {
  names() {
    return Object.keys(palettes);
  },
  setActive(name) {
    if (palettes[name]) activeName = name;
  },
  activeName() {
    return activeName;
  },
  active() {
    return palettes[activeName];
  },
  randomAccent() {
    const a = palettes[activeName].accents;
    return a[Math.floor(Math.random() * a.length)];
  }
};
