import { describe, it, expect, vi } from 'vitest';
import * as THREE from 'three';
import { createSceneConfig } from '../src/config/SceneConfig.js';
import { generateLayout, buildCandidate } from '../src/generator/generate.js';
import { encodeShare, decodeShare } from '../src/config/share.js';
import { ROTATION_SNAP } from '../src/config/defaults.js';

const STEP = Math.PI / 4;
const isMultiple = (a) => Math.abs(a / STEP - Math.round(a / STEP)) < 1e-9;

const ctx = (extra = {}) => ({
  shapeTypes: ['cube', 'plane', 'ball'], paletteNames: ['p'], orientationNames: ['landscape'],
  defaultPalette: 'p', defaultOrientation: 'landscape', randomSeed: () => 1, ...extra
});
const make = (extra) => createSceneConfig(ctx(extra));

describe('the setting in the config', () => {
  it('is off by default', () => {
    expect(ROTATION_SNAP).toBeCloseTo(Math.PI / 4, 12);
    const c = make().get();
    Object.values(c.shapes).forEach((s) => expect(s.snapRotation).toBe(false));
  });

  it('is set per shape type and only accepts booleans', () => {
    const c = make();
    c.update({ shapes: { cube: { snapRotation: true } } });
    expect(c.get().shapes.cube.snapRotation).toBe(true);
    expect(c.get().shapes.plane.snapRotation).toBe(false);
    for (const junk of ['yes', 1, 0, null, {}, []]) {
      expect(c.update({ shapes: { cube: { snapRotation: junk } } })).toBe(false);
      expect(c.get().shapes.cube.snapRotation).toBe(true);
    }
    c.update({ shapes: { cube: { snapRotation: false } } });
    expect(c.get().shapes.cube.snapRotation).toBe(false);
  });

  it('survives a preset round trip', () => {
    const a = make();
    a.update({ shapes: { plane: { snapRotation: true } } });
    const b = make();
    b.replace(JSON.parse(JSON.stringify(a.toJSON())));
    expect(b.get().shapes.plane.snapRotation).toBe(true);
    expect(b.get().shapes.cube.snapRotation).toBe(false);
  });

  it('a preset that does not mention it turns it OFF — it never inherits the current value', () => {
    const c = make();
    c.update({ shapes: { cube: { snapRotation: true } } });
    c.replace({ shapes: { cube: { count: 2 } } });          // an older preset
    expect(c.get().shapes.cube.snapRotation).toBe(false);
    expect(c.get().shapes.cube.count).toBe(2);
  });

  it('a preset with a non-boolean value means off', () => {
    const c = make();
    c.replace({ shapes: { cube: { snapRotation: 'true' } } });
    expect(c.get().shapes.cube.snapRotation).toBe(false);
  });

  it('is independent of locking', () => {
    const c = make();
    c.update({ shapes: { cube: { snapRotation: true, locked: [{ position: [0, 0, 0], rotation: [0.3, 0.2, 0.1], scale: [1, 1, 1], hex: '#112233' }] } } });
    expect(c.get().shapes.cube.snapRotation).toBe(true);
    expect(c.get().shapes.cube.locked[0].rotation).toEqual([0.3, 0.2, 0.1]); // frozen as stored, not re-snapped
  });
});

describe('generating with snapped rotation', () => {
  const shape = (type, extra = {}) => ({
    type, facesCamera: false, localHalfExtents: { x: 0.5, y: 0.5, z: 0.5 },
    randomScale: (rng) => new THREE.Vector3(0.6 + rng(), 0.6 + rng(), 0.6 + rng()), ...extra
  });
  const settings = (over = {}) => ({ visible: true, count: 6, sizeMin: 1, sizeMax: 1, spread: 1, snapRotation: false, locked: null, ...over });
  const palette = { accents: ['#111111', '#222222'], ink: '#000000' };
  const view = { depthAxis: new THREE.Vector3(4.2, 3.4, 5.2).normalize(), billboard: new THREE.Quaternion() };
  const candidate = (seed, index, snap) => buildCandidate({
    seed, shape: shape('x'), index, settings: settings({ snapRotation: snap }),
    accents: palette.accents, billboard: view.billboard
  });

  it('every angle is a multiple of 45 degrees — and never -0', () => {
    for (let seed = 0; seed < 300; seed++) {
      const r = candidate(seed, seed % 6, true).rotation;
      [r.x, r.y, r.z].forEach((a) => {
        expect(isMultiple(a)).toBe(true);
        expect(Object.is(a, -0)).toBe(false);
      });
    }
  });

  it('without it, angles are arbitrary (so the test above is not vacuous)', () => {
    let arbitrary = 0;
    for (let seed = 0; seed < 300; seed++) {
      const r = candidate(seed, 0, false).rotation;
      if (![r.x, r.y, r.z].every(isMultiple)) arbitrary++;
    }
    expect(arbitrary).toBeGreaterThan(250);
  });

  it('uses the whole set of 45-degree steps around the vertical axis', () => {
    const ys = new Set();
    for (let seed = 0; seed < 400; seed++) ys.add(Math.round(candidate(seed, 0, true).rotation.y / STEP) % 8);
    expect(ys.size).toBe(8);
  });

  it('is the SAME composition with the angles rounded: the random stream is untouched', () => {
    for (let seed = 0; seed < 60; seed++) {
      const a = candidate(seed, 1, false);
      const b = candidate(seed, 1, true);
      expect(b.position.toArray()).toEqual(a.position.toArray());
      expect(b.scale.toArray()).toEqual(a.scale.toArray());
      expect(b.hex).toBe(a.hex);
      expect(b.rotation.x).toBeCloseTo(Math.round(a.rotation.x / STEP) * STEP, 12);
      expect(b.rotation.y).toBeCloseTo(Math.round(a.rotation.y / STEP) * STEP, 12);
      expect(b.rotation.z).toBeCloseTo(Math.round(a.rotation.z / STEP) * STEP, 12);
    }
  });

  it('only affects the types that have it on', () => {
    const defs = [shape('cube'), shape('plane')];
    const layout = generateLayout({
      config: { seed: 5, shapes: { cube: settings({ snapRotation: true }), plane: settings() } },
      palette, shapeDefs: defs, view
    });
    layout.filter((e) => e.type === 'cube').forEach((e) => e.rotation.forEach((a) => expect(isMultiple(a)).toBe(true)));
    expect(layout.filter((e) => e.type === 'plane').some((e) => !e.rotation.every(isMultiple))).toBe(true);
  });

  it('is deterministic, and never touches Math.random', () => {
    vi.spyOn(Math, 'random').mockImplementation(() => { throw new Error('Math.random used'); });
    const config = { seed: 9, shapes: { cube: settings({ snapRotation: true }) } };
    const gen = () => generateLayout({ config, palette, shapeDefs: [shape('cube')], view });
    expect(gen()).toEqual(gen());
    vi.restoreAllMocks();
  });

  it('turns a "slight lean" into exactly upright, the way the angle is meant to read', () => {
    // the generator's z tilt is at most ±0.3 rad, under half a step (0.39) — so it snaps to 0
    for (let seed = 0; seed < 200; seed++) expect(candidate(seed, 0, true).rotation.z).toBe(0);
  });
});

describe('in share links', () => {
  const b64 = (obj) => Buffer.from(JSON.stringify(obj)).toString('base64url');
  const payloadOf = (link) => JSON.parse(Buffer.from(link, 'base64url').toString('utf8'));

  it('a link with nothing snapped has no rotation data (so it is unchanged from before)', () => {
    expect('r' in payloadOf(encodeShare(make().get()))).toBe(false);
  });

  it('round-trips which types snap', () => {
    const src = make();
    src.update({ seed: 4, shapes: { cube: { snapRotation: true }, ball: { snapRotation: true } } });
    const dst = make();
    dst.update(decodeShare(encodeShare(src.get())));
    expect(dst.get().shapes.cube.snapRotation).toBe(true);
    expect(dst.get().shapes.ball.snapRotation).toBe(true);
    expect(dst.get().shapes.plane.snapRotation).toBe(false);
  });

  it('a link is the whole composition: types it does not list are turned OFF for the viewer', () => {
    const viewer = make();
    viewer.update({ shapes: { plane: { snapRotation: true } } });
    viewer.update(decodeShare(encodeShare(make().get())));
    expect(viewer.get().shapes.plane.snapRotation).toBe(false);
  });

  it('old links (no `r` at all) decode as everything off', () => {
    const patch = decodeShare(b64({ v: 1, s: 1, h: { cube: [1, 1, 1, 1, 1] } }));
    expect(patch.shapes.cube.snapRotation).toBe(false);
  });

  it('ignores malformed `r` data and types the link does not describe', () => {
    const base = { v: 1, s: 1, h: { cube: [1, 1, 1, 1, 1] } };
    for (const bad of [{ r: 'cube' }, { r: { cube: true } }, { r: 5 }, { r: null }, { r: [1, null, {}, ['cube']] }]) {
      expect(decodeShare(b64({ ...base, ...bad })).shapes.cube.snapRotation).toBe(false);
    }
    const patch = decodeShare(b64({ ...base, r: ['ghost', 'cube'] }));
    expect(Object.keys(patch.shapes)).toEqual(['cube']);
    expect(patch.shapes.cube.snapRotation).toBe(true);
  });
});
