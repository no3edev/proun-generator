import { describe, it, expect, vi, beforeEach } from 'vitest';
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

const v8 = await import('node:v8');
const vm = await import('node:vm');
const { frameDt } = await import('../src/core/frameClock.js');
const { AutoAdvance } = await import('../src/core/AutoAdvance.js');
const { STRATEGY_NAMES } = await import('../src/generator/strategies/index.js');
const { palettes } = await import('../src/palette/palettes.js');

// Stage 6.5: a long session at Exhibition timing (a 1-minute transition, a 15-minute hold) on the animation clock, played much faster
// than real time with a fake frame source: the real AutoAdvance starts every change, the real Composition, Tween and Rhythm run it.
//
// With `npm test` it plays a few cycles as a smoke test (about a second). For a real soak, run it yourself:
//
//   SOAK=1 npx vitest run tests/soak.test.js                      24 simulated hours
//   SOAK=1 SOAK_HOURS=72 npx vitest run tests/soak.test.js        72 simulated hours
//
// Other settings: SOAK_CYCLES=n (a number of cycles instead of hours), SOAK_FPS=20 (frames per simulated second), SOAK_HEAP_MB=25
// (the heap growth that fails a SOAK run). It prints a report (cycles, timing, shapes, tween bookkeeping, heap). The checks:
//   - timing: an automatic change starts every transition + hold of ANIMATION time, give or take one frame, however long the run
//   - a long hold is still: 2 minutes after a change and again just before the next, every shape is bit for bit the same, no tween runs
//   - nothing grows: shapes in the scene equal the layout's, Tween's bookkeeping is bounded, the heap (after a forced GC) is flat
//   - hitches, tab suspensions of 5 to 30 minutes and now and then a new palette or strategy are mixed in
// What it cannot show: the real renderer, the GPU, the browser's own timers. For those see the README, "Long sessions".

const SOAK = !!process.env.SOAK;
const HOURS = Number(process.env.SOAK_HOURS) || 24;
const WINDOW = 60_000, HOLD = 900_000, CYCLE = WINDOW + HOLD;
const CYCLES = Number(process.env.SOAK_CYCLES) || (SOAK ? Math.ceil((HOURS * 3_600_000) / CYCLE) : 3);
const FPS = Number(process.env.SOAK_FPS) || 20;
const HEAP_MB = Number(process.env.SOAK_HEAP_MB) || 25;

function mulberry32(a) {
  return () => { a |= 0; a = (a + 0x6d2b79f5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}
let gc = null;
try { v8.setFlagsFromString('--expose-gc'); gc = vm.runInNewContext('gc'); } catch { gc = null; }
const heapMB = () => { if (gc) gc(); return process.memoryUsage().heapUsed / 1048576; };

const sceneMeshes = (scene) => scene.children.filter((c) => c.isMesh);
const stateOf = (scene) => sceneMeshes(scene).map((m) => [
  ...m.position.toArray(), ...m.quaternion.toArray(), ...m.scale.toArray(), m.userData.baseColor.getHex(), m.userData.front.uFront.value, m.userData.front.uHiAmt.value
]);

describe(`long session at Exhibition timing (${SOAK ? `SOAK: ${CYCLES} cycles = ${(CYCLES * CYCLE / 3_600_000).toFixed(1)} simulated hours` : `smoke: ${CYCLES} cycles`})`, () => {
  /** the scene the previous session left: the app removes a shape's tweens with the shape, a test that drops a whole scene must too */
  let previousScene = null;
  /** @param {boolean} curated Auto shows the Library's presets (Stage 7.4) instead of new random compositions */
  const session = (curated) => {
    if (previousScene) previousScene.children.forEach((m) => Tween.removeForMesh(m));
    const rng = mulberry32(2026);
    Rhythm.reset(); Rhythm.setHold(null, WINDOW);
    const shapes = {};
    shapeRegistry.forEach((s) => { shapes[s.type] = { visible: true, count: 3, sizeMin: 1, sizeMax: 1, spread: 1, snapRotation: false }; });
    // the new scene subscribes first (init), so the previous session's scene, which a config replace would otherwise still change and
    // tween, is no longer listening; then the configuration is loaded and everything runs out
    const scene = new THREE.Scene();
    previousScene = scene;
    Composition.init(scene);
    SceneConfig.replace({ version: 4, seed: 1000, palette: 'Proun — classic', orientation: 'landscape', composition: { strategy: 'axis-thrust' }, shapes,
      time: { durationMs: WINDOW, holdMs: HOLD, autoAdvance: true, playlist: curated } });
    Tween.update(1e7);
    AutoAdvance.reset();
    const names = Object.keys(palettes);

    let wall = 0, anim = 0, frames = 0, advances = 0, lastAdvanceAnim = null, interrupted = false;
    let holdState = null, holdChecked = false;
    const gaps = []; const heap = []; const meshesSeen = []; let maxActive = 0, maxFinished = 0, stalls = 0, hitches = 0;
    const t0 = Date.now();
    const base = heapMB();

    while (advances < CYCLES) {
      // a frame source with some life in it: a steady frame with jitter, now and then a hitch, now and then a hidden tab for minutes
      let raw = (1000 / FPS) * (0.8 + 0.4 * rng());
      const r = rng();
      if (r < 0.0004) { raw = 200 + 600 * rng(); hitches++; }
      else if (r < 0.0004 + 0.00003) { raw = 300_000 + 1_500_000 * rng(); stalls++; }
      const dt = frameDt(raw);
      wall += raw; anim += dt; frames++;
      Tween.update(dt); Rhythm.update(dt);
      const fired = AutoAdvance.update(dt);
      const st = Tween.stats(); if (st.active > maxActive) maxActive = st.active; if (st.finished > maxFinished) maxFinished = st.finished;

      // a long hold is still
      const since = AutoAdvance.elapsed();
      if (!fired && !holdState && since >= 2 * WINDOW) {
        expect(Tween.activeMeshes().length, `cycle ${advances}: tweens still running ${Math.round(since / 1000)} s after a 1-minute change`).toBe(0);
        expect(sceneMeshes(scene).length, `cycle ${advances}: shapes in the scene`).toBe(layoutNow().length);
        holdState = stateOf(scene); holdChecked = false;
      }
      if (!fired && holdState && !holdChecked && since >= CYCLE - 2000) {
        expect(Tween.activeMeshes().length, `cycle ${advances}: a tween running in the hold`).toBe(0);
        expect(stateOf(scene), `cycle ${advances}: the picture moved during the hold`).toEqual(holdState);
        holdChecked = true;
      }

      if (fired) {
        advances++;
        if (lastAdvanceAnim !== null && !interrupted) gaps.push(anim - lastAdvanceAnim);
        lastAdvanceAnim = anim; interrupted = false; holdState = null;
        meshesSeen.push(sceneMeshes(scene).length);
        if (advances % 10 === 0 || advances === 1) heap.push(heapMB());
        // now and then someone changes the palette or the strategy by hand (a change of its own, which restarts the cycle)
        if (advances % 2 === 0) { SceneConfig.update({ palette: names[Math.floor(rng() * names.length)] }); interrupted = true; }
        if (advances % 3 === 0) { SceneConfig.update({ composition: { strategy: STRATEGY_NAMES[Math.floor(rng() * STRATEGY_NAMES.length)] } }); interrupted = true; }
      }
    }
    Tween.update(1e7);

    // timing: every uninterrupted cycle is the transition plus the hold of animation time, give or take the frame that noticed it
    expect(gaps.length).toBeGreaterThan(0);
    for (const g of gaps) { expect(g).toBeGreaterThanOrEqual(CYCLE - 1e-6); expect(g).toBeLessThanOrEqual(CYCLE + 1000 + 1e-6); }
    // nothing grows
    expect(Math.max(...meshesSeen)).toBeLessThanOrEqual(Math.max(...meshesSeen.slice(0, 5)) * 4 + 20);
    expect(maxActive).toBeLessThanOrEqual(shapeRegistry.length * 40);
    expect(Tween.stats().active).toBe(0);
    expect(Tween.stats().finished).toBeLessThanOrEqual(sceneMeshes(scene).length);
    expect(Tween.stats().scrubbed).toBe(0);
    for (const m of sceneMeshes(scene)) for (const v of [...m.position.toArray(), ...m.quaternion.toArray(), ...m.scale.toArray()]) expect(Number.isFinite(v)).toBe(true);

    // heap: the first samples are warm-up; compare the middle with the end
    let heapLine = 'n/a (no gc)';
    if (gc && heap.length >= 6) {
      const third = Math.floor(heap.length / 3);
      const mid = heap.slice(third, 2 * third).reduce((a, b) => a + b, 0) / third;
      const end = heap.slice(-third).reduce((a, b) => a + b, 0) / third;
      heapLine = `${heap[0].toFixed(1)} MB first, ${mid.toFixed(1)} MB middle, ${end.toFixed(1)} MB end (growth ${(end - mid).toFixed(1)} MB, limit ${HEAP_MB})`;
      if (SOAK) expect(end - mid, `heap grew ${(end - mid).toFixed(1)} MB over the last two thirds of ${CYCLES} cycles`).toBeLessThan(HEAP_MB);
    } else if (gc) heapLine = `${base.toFixed(1)} MB at start, ${heapMB().toFixed(1)} MB at end (too few samples to judge)`;

    const mean = gaps.reduce((a, b) => a + b, 0) / gaps.length;
    console.log([
      '', `  long session report (${SOAK ? 'SOAK' : 'smoke'})`,
      `  cycles: ${advances} (${gaps.length} uninterrupted), simulated ${(anim / 3_600_000).toFixed(2)} h of animation in ${(wall / 3_600_000).toFixed(2)} h of wall time, ${frames} frames, ${(Date.now() - t0) / 1000}s real`,
      `  hitches ${hitches}, tab suspensions ${stalls} (each counted as 100 ms of animation)`,
      `  cycle length: mean ${(mean / 1000).toFixed(3)} s, min ${(Math.min(...gaps) / 1000).toFixed(3)} s, max ${(Math.max(...gaps) / 1000).toFixed(3)} s (nominal ${CYCLE / 1000} s)`,
      `  shapes in the scene: ${Math.min(...meshesSeen)} to ${Math.max(...meshesSeen)}; tweens at most ${maxActive} at once; finished bookkeeping at most ${maxFinished}`,
      `  heap: ${heapLine}`, ''
    ].join('\n'));
  };
  it('starts a change every cycle, holds perfectly still between them, and grows nothing', () => session(false), 3_600_000);
  it('the same with the curated sequence on: the Library\'s presets, round after round', () => session(true), 3_600_000);
});
