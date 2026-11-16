import { describe, it, expect, vi, beforeEach, afterAll } from 'vitest';
import * as THREE from 'three';

// End to end, against a real THREE.Scene: Composition + the generator + Tween + matching. Only what needs a canvas is stood in
// for: a shape's mesh is a plain box (its geometry and shading are not what is under test), and paint/dispose are recorded.
vi.mock('../src/shapes/registry.js', async (importOriginal) => {
  const actual = await importOriginal();
  const T = await import('three');
  const wrap = (shape) => ({
    ...shape,
    create: (hex) => {
      const m = new T.Mesh(new T.BoxGeometry(1, 1, 1), new T.MeshBasicMaterial());
      m.userData.baseColor = new T.Color(hex);
      m.userData.shapeType = shape.type;
      m.userData.facesCamera = shape.facesCamera;
      // the colour-front state Tween drives, and where the paint samples (see texture/paintSeed.js)
      m.userData.front = {
        uFront: { value: 1 }, uFrontA: { value: 1 }, uFrom: { value: new T.Color() }, uMid: { value: new T.Color() }, uSeed: { value: new T.Vector2() }, uSeedFrom: { value: new T.Vector2() }, seedFromSet: false,
        uHiAmt: { value: 0 }, uHiN: { value: new T.Vector3() }, uHiBand: { value: new T.Vector2() }, uHiTint: { value: new T.Color() }, hiDir: new T.Vector3()
      };
      return m;
    }
  });
  const shapeRegistry = actual.shapeRegistry.map(wrap);
  return { ...actual, shapeRegistry, getShape: (type) => shapeRegistry.find((s) => s.type === type) };
});
vi.mock('../src/texture/materials.js', async (importOriginal) => ({
  ...(await importOriginal()),
  paintMesh: (mesh, color) => { mesh.userData.baseColor = (mesh.userData.baseColor || new THREE.Color()).copy(color); },
  disposeMesh: (mesh) => { mesh.userData.disposed = true; }
}));

const { Composition } = await import('../src/core/Composition.js');
const { SceneConfig } = await import('../src/config/store.js');
const { Billboard } = await import('../src/core/Billboard.js');
const { Tween } = await import('../src/core/Tween.js');
const { Rhythm } = await import('../src/core/Rhythm.js');
const { generateLayout } = await import('../src/generator/generate.js');
const { diagnoseLayout } = await import('../src/generator/diagnostics.js');
const { shapeRegistry } = await import('../src/shapes/registry.js');
const { Palette } = await import('../src/palette/Palette.js');
const { CAMERA } = await import('../src/config/defaults.js');
const { paintSeed, paintSlots } = await import('../src/texture/paintSeed.js');

const camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0.1, 100);
camera.position.set(...CAMERA.position);
Billboard.computeFromCamera(camera);

const ALL_ON = { rod: 1, beam: 1, segment: 1, crescent: 1, frame: 1, ring: 1 };
const layoutNow = () => {
  const config = SceneConfig.get();
  return generateLayout({ config, palette: Palette.get(config.palette), shapeDefs: shapeRegistry, view: { depthAxis: Billboard.direction(), billboard: Billboard.get() } });
};
const meshes = (scene) => scene.children.filter((c) => c.isMesh);
const flush = () => Tween.update(100000); // run every tween to its end

const { frameDt } = await import('../src/core/frameClock.js');
const { palettes } = await import('../src/palette/palettes.js');
const { STRATEGY_NAMES } = await import('../src/generator/strategies/index.js');
const { ORIENTATIONS } = await import('../src/config/defaults.js');
const { setStagger } = await import('../src/core/schedule.js');

// Stage 6.4: interruption fuzz. Random sequences of the things a person (or the auto timer) can do while a change is still under
// way: advance, new palette, new strategy, another orientation, shape counts and sizes, lock and unlock, a preset replacing the
// whole configuration, another timing, the lab's Stagger and pause, and time passing in frames of any length, stalls included.
// After every step the scene must be sound (finite numbers, one tween per shape, no tween on a shape that is gone) and a change
// must not move a shape that stays (no jump in position, rotation or size); once everything has run out the scene must be
// exactly the layout the configuration generates, as a fresh scene shows it, with nothing left over (owed after a change that
// re-resolves the frame: every run ends with an advance).
//
// A fixed set of seeds runs with every `npm test`; FUZZ=1 runs many more (FUZZ_SEEDS=n and FUZZ_STEPS=n set the size), e.g.
//   FUZZ=1 npx vitest run tests/fuzzInterruptions.test.js
// A failure names its seed and the steps that led to it: run that seed alone with FUZZ_ONLY=<seed>.

const FULL = !!process.env.FUZZ;
const SEEDS = Number(process.env.FUZZ_SEEDS) || (FULL ? 1500 : 24);
const STEPS = Number(process.env.FUZZ_STEPS) || (FULL ? 30 : 16);
const ONLY = process.env.FUZZ_ONLY ? Number(process.env.FUZZ_ONLY) : null;

function mulberry32(a) {
  return () => { a |= 0; a = (a + 0x6d2b79f5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}
const SHAPE_TYPES = shapeRegistry.map((s) => s.type);
const PALETTES = Object.keys(palettes);
const ORIENTS = Object.keys(ORIENTATIONS);
const DURATIONS = [200, 1100, 5000, 60_000, 300_000];

const finite = (v) => Number.isFinite(v);
const sceneMeshes = (scene) => scene.children.filter((c) => c.isMesh);

/** a configuration like a loaded preset, drawn from the seed */
function randomConfig(rng, time) {
  const shapes = {};
  SHAPE_TYPES.forEach((type) => {
    shapes[type] = { visible: rng() < 0.85, count: Math.floor(rng() * 4), sizeMin: 0.7 + rng() * 0.3, sizeMax: 1 + rng() * 0.5, spread: 0.5 + rng(), snapRotation: rng() < 0.3, locked: null };
  });
  return {
    version: 4, seed: 1 + Math.floor(rng() * 1e6), palette: PALETTES[Math.floor(rng() * PALETTES.length)], orientation: ORIENTS[Math.floor(rng() * ORIENTS.length)],
    time: { ...time, autoAdvance: false }, composition: { strategy: STRATEGY_NAMES[Math.floor(rng() * STRATEGY_NAMES.length)] }, shapes
  };
}

/** the scenes earlier seeds left behind: the app removes a shape's tweens with the shape, a test that drops a whole scene must too */
const oldScenes = [];

function run(seed) {
  oldScenes.splice(0).forEach((sc) => sc.children.forEach((m) => Tween.removeForMesh(m)));
  const rng = mulberry32(seed);
  const pick = (arr) => arr[Math.floor(rng() * arr.length)];
  const log = [];
  const fail = (msg) => { throw new Error(`fuzz seed ${seed}: ${msg}\n  steps: ${log.join(' > ')}`); };
  let window = pick(DURATIONS);
  let held = false;

  Rhythm.reset(); Rhythm.setHold(null, 1000);
  setStagger({ amount: pick([0, 0.5, 1]) });
  // the new scene subscribes first (init), so the previous seed's scene, which a config replace would otherwise still change and
  // tween, is no longer listening; then the configuration is loaded like a preset and everything runs out
  const scene = new THREE.Scene();
  oldScenes.push(scene);
  Composition.init(scene);
  SceneConfig.replace(randomConfig(rng, { durationMs: window, holdMs: 2900 }));
  Tween.update(1e7);

  const snapshot = () => new Map(sceneMeshes(scene).map((m) => [m, { p: m.position.clone(), q: m.quaternion.clone(), s: m.scale.clone() }]));

  function sound(when) {
    const active = Tween.activeMeshes();
    if (new Set(active).size !== active.length) fail(`${when}: two tweens on one shape`);
    const inScene = new Set(sceneMeshes(scene));
    for (const m of active) {
      if (m.userData.disposed) fail(`${when}: a tween on a disposed shape`);
      if (!inScene.has(m)) fail(`${when}: a tween on a shape that is not in the scene (a ${m.userData.shapeType}, role ${m.userData.role}, parent ${m.parent ? 'yes' : 'no'}, scale ${m.scale.x.toExponential(2)}, held ${held})`);
    }
    for (const m of inScene) {
      if (m.userData.disposed) fail(`${when}: a disposed shape is still in the scene`);
      for (const v of [...m.position.toArray(), ...m.quaternion.toArray(), ...m.scale.toArray()]) if (!finite(v)) fail(`${when}: a non-finite number on a ${m.userData.shapeType}`);
      const f = m.userData.front;
      if (!(f.uFront.value >= 0 && f.uFront.value <= 1)) fail(`${when}: front ${f.uFront.value} outside 0..1`);
      if (!(f.uHiAmt.value >= 0 && f.uHiAmt.value <= 1)) fail(`${when}: highlight ${f.uHiAmt.value} outside 0..1`);
    }
    if (!finite(Rhythm.energy) || !finite(Rhythm.phase)) fail(`${when}: Rhythm gone non-finite`);
  }

  /** a configuration change: nothing that stays may jump */
  function change(name, fn) {
    log.push(name);
    const before = snapshot();
    const events = Rhythm.events;
    fn();
    Tween.update(0);                                   // the first frame of whatever the change started
    sound(name);
    if (Rhythm.events !== events && !held) {
      // a change that re-resolves the frame is over, for EVERY shape, inside its own window: nothing from an earlier, slower change
      // (shapes still shrinking away from it, say) may outlast it
      const w = SceneConfig.get().time.durationMs;
      for (const m of Tween.activeMeshes()) {
        const left = Tween.remainingOf(m);
        if (left > w + 1e-6) fail(`${name}: a ${m.userData.shapeType} (${m.userData.role}) has ${Math.round(left)} ms left, more than the ${w} ms of this change`);
      }
    }
    if (held) return;                                  // the lab's pause scrubs on purpose
    for (const m of sceneMeshes(scene)) {
      const b = before.get(m);
      if (!b) continue;                                // a shape that is new starts as a speck
      const d = m.position.distanceTo(b.p);
      if (d > 1e-4) fail(`${name}: a ${m.userData.shapeType} (${m.userData.role}) jumped ${d.toFixed(5)} in position`);
      if (!m.userData.facesCamera) { const a = m.quaternion.angleTo(b.q); if (a > 1e-4) fail(`${name}: a ${m.userData.shapeType} jumped ${a.toFixed(5)} rad in rotation`); }
      const ds = m.scale.distanceTo(b.s);
      if (ds > 1e-4) fail(`${name}: a ${m.userData.shapeType} jumped ${ds.toFixed(5)} in size`);
    }
  }

  for (let i = 0; i < STEPS; i++) {
    const r = rng();
    if (r < 0.18) change('advance', () => Composition.advance());
    else if (r < 0.26) change('palette', () => SceneConfig.update({ palette: pick(PALETTES) }));
    else if (r < 0.34) change('strategy', () => SceneConfig.update({ composition: { strategy: pick(STRATEGY_NAMES) } }));
    else if (r < 0.38) change('orientation', () => SceneConfig.update({ orientation: pick(ORIENTS) }));
    else if (r < 0.48) {
      const type = pick(SHAPE_TYPES), what = pick(['count', 'count', 'visible', 'size', 'spread', 'snap']);
      change(`${what}:${type}`, () => SceneConfig.update({ shapes: { [type]: what === 'count' ? { count: Math.floor(rng() * 7) } : what === 'visible' ? { visible: rng() < 0.5 } : what === 'size' ? { sizeMin: 0.6 + rng() * 0.4, sizeMax: 1 + rng() } : what === 'spread' ? { spread: rng() * 2 } : { snapRotation: rng() < 0.5 } } }));
    }
    else if (r < 0.52) { const type = pick(SHAPE_TYPES); change(rng() < 0.5 ? `lock:${type}` : `unlock:${type}`, () => (log[log.length - 1].startsWith('lock') ? Composition.lock(type) : Composition.unlock(type))); }
    else if (r < 0.58) change('preset', () => { window = pick(DURATIONS); SceneConfig.replace(randomConfig(rng, { durationMs: window, holdMs: 2900 })); });
    else if (r < 0.64) change('timing', () => { window = pick(DURATIONS); SceneConfig.update({ time: { durationMs: window, holdMs: Math.floor(rng() * 5000) } }); });
    else if (r < 0.68) { const a = pick([0, 0.3, 1]); log.push(`stagger:${a}`); setStagger({ amount: a }); }
    else if (r < 0.72) { held = true; log.push('pause'); Rhythm.setHold(rng(), window); Tween.update(16); sound('pause'); }
    else if (r < 0.76) { held = false; log.push('release'); Rhythm.setHold(null, window); Tween.update(16); sound('release'); }
    else {
      // time passes in a frame of any length: a normal one, a slow one, a stall, a good part of a window, a huge one
      const raw = pick([0, 8, 16.7, 33, 250, 900, 1500, 0.05 * window, 0.4 * window, 1.1 * window, 3_600_000]);
      log.push(`frame:${Math.round(raw)}`);
      const dt = frameDt(raw);
      Tween.update(dt); Rhythm.update(dt);
      sound(`frame:${raw}`);
    }
  }

  // A size, spread or snap change leaves the shapes where they are until the next advance re-resolves the whole frame (by design,
  // see Composition.onConfigChange), so "exactly the layout" is only owed after a change that recomposes: end with one, then let
  // everything run out.
  if (held) { held = false; Rhythm.setHold(null, window); Tween.update(16); }
  change('final advance', () => Composition.advance());
  log.push('flush');
  Tween.update(1e7); Rhythm.update(1e7);
  sound('flush');
  if (Tween.activeMeshes().length) fail('a tween is still running after everything ran out');
  const got = sceneMeshes(scene);
  const expected = layoutNow();
  if (got.length !== expected.length) fail(`${got.length} shapes in the scene, the layout has ${expected.length} (leftovers or missing shapes)`);
  got.forEach((m) => {
    if (m.userData.front.uFront.value !== 1) fail(`a ${m.userData.shapeType} is not fully recoloured (${m.userData.front.uFront.value})`);
    if (m.scale.x < 0.01) fail(`a ${m.userData.shapeType} is left shrunk to a speck`);
  });

  // exactly the scene a fresh start shows (a finished scene is the layout it was generated from, bit for bit)
  const fingerprint = (meshesIn) => meshesIn.map((m) => [
    m.userData.shapeType, ...m.position.toArray().map((v) => v.toFixed(5)), ...m.scale.toArray().map((v) => v.toFixed(5)),
    ...(m.userData.facesCamera ? [] : m.quaternion.toArray().map((v) => v.toFixed(5))), m.userData.baseColor.getHexString()
  ].join(' ')).sort();
  const settled = fingerprint(got);
  const fresh = new THREE.Scene();
  oldScenes.push(fresh);
  Composition.init(fresh);
  const reference = fingerprint(sceneMeshes(fresh));
  for (let i = 0; i < reference.length; i++) if (settled[i] !== reference[i]) fail(`the settled scene differs from a fresh one:\n    settled   ${settled[i]}\n    fresh     ${reference[i]}`);
}

describe(`interruption fuzz (${ONLY !== null ? `seed ${ONLY}` : `${SEEDS} seeds x ${STEPS} steps${FULL ? ', FUZZ=1' : ''}`})`, () => {
  afterAll(() => { setStagger({ amount: 1 }); Rhythm.setHold(null, 1000); });
  const seeds = ONLY !== null ? [ONLY] : Array.from({ length: SEEDS }, (_, i) => i + 1);
  it('keeps the scene sound, never makes a shape jump, and settles on exactly the layout', () => {
    for (const seed of seeds) run(seed);
  }, 600_000);
});
