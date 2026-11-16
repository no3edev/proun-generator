// @ts-check
import { createSceneConfig } from './SceneConfig.js';
import { createHistory } from './History.js';
import { shapeRegistry } from '../shapes/registry.js';
import { palettes, PALETTE_ALIASES, DEFAULT_PALETTE } from '../palette/palettes.js';
import { ORIENTATIONS } from './defaults.js';
import { STRATEGY_NAMES } from '../generator/strategies/index.js';

// The app's one SceneConfig, wired to the real shape registry, palettes
// and orientations. Import this wherever the scene's state is read or
// changed; see SceneConfig.js for the model.
/** @type {Record<string, Partial<import('../types.js').ShapeSettings>>} */
const shapeDefaults = {};
shapeRegistry.forEach((s) => { if (s.defaults) shapeDefaults[s.type] = s.defaults; });

/** The context the app's config is built with (exported so tools and tests can build fresh instances with the same defaults). */
export const appConfigContext = {
  shapeTypes: shapeRegistry.map((s) => s.type),
  paletteNames: Object.keys(palettes),
  paletteAliases: PALETTE_ALIASES,
  orientationNames: Object.keys(ORIENTATIONS),
  strategyNames: STRATEGY_NAMES,
  defaultPalette: DEFAULT_PALETTE,
  defaultOrientation: 'landscape',
  // a shape can start differently from the global defaults (the rod starts at 0)
  shapeDefaults
};
export const SceneConfig = createSceneConfig(appConfigContext);

// Back / forward through the compositions shown. Recording starts at boot,
// once the starting config is settled (main.js bootConfig).
export const SceneHistory = createHistory(SceneConfig);
