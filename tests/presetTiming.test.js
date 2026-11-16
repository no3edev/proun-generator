import { describe, it, expect } from 'vitest';
import { LIBRARY } from '../src/presets/library.js';
import { createSceneConfig } from '../src/config/SceneConfig.js';
import { appConfigContext } from '../src/config/store.js';
import { applyPreset } from '../src/presets/applyPreset.js';
import { TIMING_PRESETS } from '../src/config/defaults.js';

// Stage 7.1: a preset is a composition. Loading one must not touch the viewer's timing (transition, hold, Auto): on an unattended
// Exhibition display a preset saved with Dev timing and Auto off used to turn it back into exactly that.

const EXHIBITION = { durationMs: TIMING_PRESETS.exhibition.durationMs, holdMs: TIMING_PRESETS.exhibition.holdMs, autoAdvance: true, playlist: false };

function exhibitionConfig() {
  const c = createSceneConfig(appConfigContext);
  c.update({ time: EXHIBITION });
  return c;
}

describe('loading a preset keeps the viewer\'s timing (7.1)', () => {
  it('every Library preset gives the composition and leaves transition, hold and Auto alone', () => {
    expect(LIBRARY.length).toBeGreaterThan(5);
    for (const entry of LIBRARY) {
      const c = exhibitionConfig();
      applyPreset(c, entry.config);
      expect(c.get().time, entry.name).toEqual(EXHIBITION);
      // and the composition is the preset's
      const alone = createSceneConfig(appConfigContext);
      alone.replace(entry.config);
      const { time: _a, ...got } = c.get(); const { time: _b, ...want } = alone.get();
      expect(got, entry.name).toEqual(want);
    }
  });

  it('a preset that was saved with its own timing (or with Auto on) does not impose it', () => {
    const c = createSceneConfig(appConfigContext);
    const keep = c.get().time;
    applyPreset(c, { ...LIBRARY[0].config, time: { durationMs: 7000, holdMs: 123000, autoAdvance: true } });
    expect(c.get().time).toEqual(keep);
    const d = exhibitionConfig();
    applyPreset(d, { ...LIBRARY[1].config, time: { durationMs: 700, holdMs: 0, autoAdvance: false } });
    expect(d.get().time).toEqual(EXHIBITION);
  });

  it('older stored presets still load as compositions: no seed (v1), an interval (v3), no timing at all', () => {
    for (const raw of [
      { palette: LIBRARY[0].config.palette, orientation: 'landscape', shapes: LIBRARY[0].config.shapes },                    // v1: no seed, no version
      { ...LIBRARY[2].config, version: 3, time: { durationMs: 1100, intervalMs: 4000, autoAdvance: true } },                 // v3
      { ...LIBRARY[3].config, time: undefined }
    ]) {
      const c = exhibitionConfig();
      expect(applyPreset(c, raw)).toBe(true);
      expect(c.get().time).toEqual(EXHIBITION);
      expect(c.get().version).toBe(4);
    }
  });

  it('is still "show me this": it notifies as a replace even when the composition is the one already showing', () => {
    const c = exhibitionConfig();
    applyPreset(c, LIBRARY[0].config);
    const metas = [];
    c.subscribe((_n, _p, meta) => metas.push(meta));
    applyPreset(c, LIBRARY[0].config);
    expect(metas).toEqual([{ replaced: true }]);
  });

  it('a viewer\'s own saved preset (it stores its timing) round-trips the composition and still leaves the timing', () => {
    const c = exhibitionConfig();
    c.update({ seed: 4242, palette: LIBRARY[0].config.palette });
    // the stored record is the whole config, timing included; loading it takes the composition only
    const saved = c.toJSON();
    const d = createSceneConfig(appConfigContext);
    d.update({ time: { durationMs: 2000, holdMs: 500, autoAdvance: false } });
    applyPreset(d, { name: 'mine', id: 'x', ...saved });
    expect(d.get().seed).toBe(4242);
    expect(d.get().time).toEqual({ durationMs: 2000, holdMs: 500, autoAdvance: false, playlist: false });
  });

  it('the restored session is the viewer\'s own state and keeps its timing as saved (replace without keepTime)', () => {
    const c = createSceneConfig(appConfigContext);
    c.replace({ ...LIBRARY[0].config, time: { durationMs: 60000, holdMs: 900000, autoAdvance: true } });
    expect(c.get().time).toEqual(EXHIBITION);
  });
});
