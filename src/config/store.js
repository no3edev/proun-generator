// @ts-check
import { createSceneConfig } from './SceneConfig.js';
import { createHistory } from './History.js';
import { shapeRegistry } from '../shapes/registry.js';
import { palettes, DEFAULT_PALETTE } from '../palette/palettes.js';
import { ORIENTATIONS } from './defaults.js';
import { STRATEGY_NAMES } from '../generator/strategies/index.js';

// The app's one SceneConfig, wired to the real shape registry, palettes
// and orientations. Import this wherever the scene's state is read or
// changed; see SceneConfig.js for the model.
/** @type {Record<string, Partial<import('../types.js').ShapeSettings>>} */
const shapeDefaults = {};
shapeRegistry.forEach((s) => { if (s.defaults) shapeDefaults[s.type] = s.defaults; });

export const SceneConfig = createSceneConfig({
  shapeTypes: shapeRegistry.map((s) => s.type),
  paletteNames: Object.keys(palettes),
  orientationNames: Object.keys(ORIENTATIONS),
  strategyNames: STRATEGY_NAMES,
  defaultPalette: DEFAULT_PALETTE,
  defaultOrientation: 'landscape',
  // a shape can start differently from the global defaults (the rod starts at 0)
  shapeDefaults
});

// Back / forward through the compositions shown. Recording starts at boot,
// once the starting config is settled (main.js bootConfig).
export const SceneHistory = createHistory(SceneConfig);
