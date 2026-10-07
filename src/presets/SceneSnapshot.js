// Captures/applies a scene preset against the live app modules. This
// is the one file that knows both the preset schema (PresetStore.js)
// and the app's actual state-holding modules — everything here stays
// DOM-free, same as Palette.js/Composition.js/ShapeSettings.js, so
// the DOM syncing (select values, inputs, the shape accordion) stays
// owned by ui/PresetsPanel.js, consistent with the rest of the app.

import { Palette } from '../palette/Palette.js';
import { SceneManager } from '../core/SceneManager.js';
import { Composition } from '../core/Composition.js';
import { ShapeSettings } from '../settings/ShapeSettings.js';
import { shapeRegistry } from '../shapes/registry.js';

/**
 * Reads everything the module layer knows about the current scene.
 * `intervalMs`/`autoAdvance` aren't owned by any module (they're
 * plain DOM state in Panel.js), so the caller passes them in.
 *
 * @param {{ intervalMs: number, autoAdvance: boolean }} timeState
 * @returns {object} a snapshot ready for PresetStore.save()
 */
export function captureSnapshot({ intervalMs, autoAdvance }) {
  const shapes = {};
  shapeRegistry.forEach((s) => {
    shapes[s.type] = { ...ShapeSettings.get(s.type) };
  });

  return {
    palette: Palette.activeName(),
    orientation: SceneManager.orientation,
    time: {
      durationMs: Composition.getDuration(),
      intervalMs,
      autoAdvance: !!autoAdvance
    },
    shapes
  };
}

/**
 * Applies a stored snapshot to the live scene. Unknown/missing shape
 * types are skipped rather than erroring, so a preset saved before a
 * shape was added or removed from the registry still loads cleanly.
 * An invalid/missing palette or orientation falls back to whatever is
 * currently active rather than throwing.
 *
 * @param {object} snapshot
 * @returns {{ palette: string, orientation: string, time: object }}
 *   what was actually applied, so the caller can sync its own DOM.
 */
export function applySnapshot(snapshot) {
  const palette = Palette.names().includes(snapshot.palette) ? snapshot.palette : Palette.activeName();
  Palette.setActive(palette);
  SceneManager.updateBackground();

  const orientation = SceneManager.orientationNames().includes(snapshot.orientation)
    ? snapshot.orientation
    : SceneManager.orientation;
  SceneManager.applyOrientation(orientation);

  const time = {
    durationMs: Number.isFinite(snapshot.time?.durationMs) ? snapshot.time.durationMs : Composition.getDuration(),
    intervalMs: Number.isFinite(snapshot.time?.intervalMs) ? snapshot.time.intervalMs : 4000,
    autoAdvance: !!snapshot.time?.autoAdvance
  };
  Composition.setDuration(time.durationMs);

  shapeRegistry.forEach((s) => {
    const saved = snapshot.shapes && snapshot.shapes[s.type];
    if (!saved) return; // preset predates this shape type — leave current settings alone
    if (Number.isFinite(saved.sizeMin) && Number.isFinite(saved.sizeMax)) {
      ShapeSettings.setSizeRange(s.type, saved.sizeMin, saved.sizeMax);
    }
    if (Number.isFinite(saved.spread)) ShapeSettings.setSpread(s.type, saved.spread);
    if (Number.isFinite(saved.count)) {
      ShapeSettings.setCount(s.type, saved.count);
      Composition.setCount(s.type, ShapeSettings.get(s.type).count);
    }
    const visible = typeof saved.visible === 'boolean' ? saved.visible : true;
    ShapeSettings.setVisible(s.type, visible);
    Composition.setVisible(s.type, visible);
  });

  // settle every instance into a fully collision-resolved arrangement
  // immediately, rather than waiting for the next click/auto-advance
  Composition.advance();

  return { palette, orientation, time };
}
