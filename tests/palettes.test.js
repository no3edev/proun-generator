import { describe, it, expect } from 'vitest';
import { palettes, PALETTE_ALIASES, DEFAULT_PALETTE } from '../src/palette/palettes.js';
import { splitPalette } from '../src/generator/strategies/common.js';
import { createSceneConfig } from '../src/config/SceneConfig.js';
import { SceneConfig } from '../src/config/store.js';

const rgb = (h) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16));
const luma = (h) => { const [r, g, b] = rgb(h); return (0.299 * r + 0.587 * g + 0.114 * b) / 255; };
// CIE76 in Lab (D65), enough to tell near-identical colours apart
function lab(h) {
  const f = (c) => { c /= 255; return c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4); };
  const [r, g, b] = rgb(h).map(f);
  const x = (0.4124 * r + 0.3576 * g + 0.1805 * b) / 0.95047, y = 0.2126 * r + 0.7152 * g + 0.0722 * b, z = (0.0193 * r + 0.1192 * g + 0.9505 * b) / 1.08883;
  const t = (v) => (v > 0.008856 ? Math.cbrt(v) : 7.787 * v + 16 / 116);
  return [116 * t(y) - 16, 500 * (t(x) - t(y)), 200 * (t(y) - t(z))];
}
const dE = (a, b) => Math.hypot(...lab(a).map((v, i) => v - lab(b)[i]));

const NAMES = Object.keys(palettes);

describe('palettes', () => {
  it('have unique names, valid hex colours, and the default exists', () => {
    expect(new Set(NAMES).size).toBe(NAMES.length);
    expect(palettes[DEFAULT_PALETTE]).toBeDefined();
    for (const [name, p] of Object.entries(palettes)) {
      [p.paper, p.ink, ...p.accents].forEach((h) => expect(h, name).toMatch(/^#[0-9a-f]{6}$/));
      expect(new Set(p.accents).size, name).toBe(p.accents.length);
    }
  });

  it('keep Proun — classic exactly as it was (goldens, baselines and old presets rest on it)', () => {
    expect(palettes['Proun — classic']).toEqual({ paper: '#e9e4d8', ink: '#201d18', accents: ['#c1362b', '#8f8a7c', '#3a3a38', '#b7bcb9', '#d8d3c4'] });
  });

  it('have a greige ground (never pure white, L 64-94) and a painter\'s black (never #000000, ink luma <= 0.2)', () => {
    for (const [name, p] of Object.entries(palettes)) {
      expect(luma(p.paper), name).toBeGreaterThan(0.6);
      expect(luma(p.paper), name).toBeLessThan(0.95);
      expect(luma(p.ink), name).toBeLessThanOrEqual(0.2);
      [p.ink, ...p.accents].forEach((h) => expect(h, name).not.toBe('#000000'));
    }
  });

  it('give a scene a tonal range: at least three neutrals clear of the paper, at most two saturated hues', () => {
    for (const [name, p] of Object.entries(palettes)) {
      const { saturated, neutrals } = splitPalette(p);
      expect(neutrals.length, `${name} neutrals`).toBeGreaterThanOrEqual(3);
      expect(saturated.length, `${name} saturated`).toBeLessThanOrEqual(2);
      // the neutrals really span a range (darkest to lightest by at least 0.25 of the luma scale)
      const ls = neutrals.map(luma);
      expect(Math.max(...ls) - Math.min(...ls), `${name} range`).toBeGreaterThanOrEqual(0.25);
    }
  });

  it('are not near-duplicates of each other (similar paper AND accents that match one for one)', () => {
    for (let i = 0; i < NAMES.length; i++) {
      for (let j = i + 1; j < NAMES.length; j++) {
        const a = palettes[NAMES[i]], b = palettes[NAMES[j]];
        const accents = a.accents.reduce((t, x) => t + Math.min(...b.accents.map((y) => dE(x, y))), 0) / a.accents.length;
        const similar = dE(a.paper, b.paper) < 8 && accents < 9;
        expect(similar, `${NAMES[i]} ~ ${NAMES[j]} (paper ${dE(a.paper, b.paper).toFixed(1)}, accents ${accents.toFixed(1)})`).toBe(false);
      }
    }
  });

  it('keep at least two deliberate monochromes (no saturated hue) and one palette with a mid-grey ground', () => {
    expect(NAMES.filter((n) => splitPalette(palettes[n]).saturated.length === 0).length).toBeGreaterThanOrEqual(2);
    expect(NAMES.some((n) => luma(palettes[n].paper) < 0.68)).toBe(true);
  });
});

describe('palette aliases', () => {
  const REMOVED = ['Proun — warm ochre', 'Proun Room — silver interior', 'The Constructor — halftone grey', 'For the Voice — book red', 'Pelikan — cream and cobalt',
    'Black Square — near-white', 'USSR Pavilion — poster red', 'Proun G7 — diagonal blue', 'Kestner Portfolio — flat primary'];
  it('answer for every removed name, and only with palettes that exist', () => {
    for (const old of REMOVED) {
      expect(palettes[old], `${old} is gone`).toBeUndefined();
      expect(NAMES, old).toContain(PALETTE_ALIASES[old]);
    }
    for (const [alias, target] of Object.entries(PALETTE_ALIASES)) { expect(palettes[alias]).toBeUndefined(); expect(NAMES).toContain(target); }
  });

  it('resolve in the app\'s config: replace() and update() map an old name to its successor, an unknown one is ignored', () => {
    SceneConfig.replace({ seed: 5, palette: 'Pelikan — cream and cobalt' });
    expect(SceneConfig.get().palette).toBe('Proun — cream and vermilion');
    SceneConfig.update({ palette: 'Proun G7 — diagonal blue' });
    expect(SceneConfig.get().palette).toBe('Proun — cool grey');
    SceneConfig.update({ palette: 'No such palette' });
    expect(SceneConfig.get().palette).toBe('Proun — cool grey');
    SceneConfig.replace({ seed: 5, palette: 'No such palette' });
    expect(SceneConfig.get().palette).toBe('Proun — cool grey'); // an unknown name keeps the palette in force
  });

  it('are an option of the config context: without it an old name keeps the palette in force as before', () => {
    const ctx = { shapeTypes: ['cube'], paletteNames: ['A', 'B'], orientationNames: ['landscape'], defaultPalette: 'A', defaultOrientation: 'landscape', randomSeed: () => 1 };
    const fresh = (extra) => createSceneConfig({ ...ctx, ...extra });
    const without = fresh(); without.replace({ seed: 1, palette: 'old' });
    expect(without.get().palette).toBe('A');
    const withAlias = fresh({ paletteAliases: { old: 'B', broken: 'Z' } });
    withAlias.replace({ seed: 1, palette: 'old' });
    expect(withAlias.get().palette).toBe('B');
    const broken = fresh({ paletteAliases: { broken: 'Z' } }); broken.replace({ seed: 1, palette: 'broken' });
    expect(broken.get().palette).toBe('A'); // an alias to a palette that does not exist is no alias
    const proto = fresh({ paletteAliases: {} }); proto.replace({ seed: 1, palette: 'constructor' });
    expect(proto.get().palette).toBe('A'); // prototype keys are not names
  });
});
