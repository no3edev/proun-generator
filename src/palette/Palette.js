import { palettes } from './palettes.js';
import { SceneConfig } from '../config/store.js';

// Palette DATA lives in palettes.js; which palette is active is part of
// the SceneConfig (this module holds no state of its own).
export const Palette = {
  names() {
    return Object.keys(palettes);
  },
  get(name) {
    return palettes[name];
  },
  /** The palette selected in the current SceneConfig. */
  active() {
    return palettes[SceneConfig.get().palette];
  }
};
