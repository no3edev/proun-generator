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

/** a fresh scene on a config of the given strategy; every tween flushed */
function setup(strategy, { counts = {}, seed = 1000, duration = 1000 } = {}) {
  Rhythm.reset();
  flush();
  const shapes = {};
  shapeRegistry.forEach((s) => {
    const on = ['rod', 'beam', 'segment', 'crescent', 'frame', 'ring'].includes(s.type);
    shapes[s.type] = { visible: true, count: counts[s.type] ?? (on ? ALL_ON[s.type] : 1), sizeMin: 1, sizeMax: 1, spread: 1, snapRotation: false };
  });
  SceneConfig.replace({
    version: 4, seed, palette: 'Proun — classic', orientation: 'landscape',
    time: { durationMs: duration, holdMs: 2900, autoAdvance: false },
    ...(strategy === 'legacy' ? {} : { composition: { strategy } }),
    shapes
  });
  const scene = new THREE.Scene();
  Composition.init(scene);
  flush();
  return scene;
}
const key = (m) => m.userData.shapeType;

describe('a change is staggered by role (6.2)', () => {
  beforeEach(() => { Rhythm.reset(); });
  const W = 60_000;
  const moved = (m, before) => m.position.distanceTo(before.get(m));

  it('early roles are under way while the late ones (accents, details) have not started; everything has arrived by the end of the window', () => {
    let early = 0, late = 0, lateTravellers = 0;
    for (const seed of [5151, 5152, 5153, 5154, 5155, 5156]) {
      const scene = setup('axis-thrust', { duration: W, seed: seed - 100 });
      const before = new Map(meshes(scene).map((m) => [m, m.position.clone()]));
      SceneConfig.update({ seed });
      const all = meshes(scene);
      const gliders = all.filter((m) => before.has(m));        // the shapes that glide (the others grow in or shrink away)
      const travel = (m) => (Tween.targetOf(m) ? before.get(m).distanceTo(Tween.targetOf(m).position) : 0);
      Tween.update(0.09 * W);                                  // 9% in: no accent or detail (they start from 10%) has moved
      gliders.forEach((m) => {
        if (travel(m) < 0.05) return;                          // a shape that stays put cannot show its schedule
        const role = m.userData.role;
        if (role === 'accent' || role === 'detail') { lateTravellers++; late += moved(m, before) > 0 ? 1 : 0; }
        else early += moved(m, before) > 0 ? 1 : 0;
      });
      Tween.update(0.16 * W);                                  // 25%: every glider has started
      gliders.forEach((m) => { if (travel(m) > 0.05) expect(moved(m, before), m.userData.role).toBeGreaterThan(0); });
      Tween.update(0.76 * W);                                  // past the end of the window: nothing is still moving, nothing is left over
      all.forEach((m) => expect(Tween.targetOf(m), m.userData.role).toBeNull());
      expect(scene.children.filter((c) => c.isMesh).length).toBe(meshes(scene).filter((m) => !m.userData.disposed).length);
    }
    expect(lateTravellers).toBeGreaterThan(0);                 // the check had something to check
    expect(late).toBe(0);
    expect(early).toBeGreaterThan(0);
  });

  it('colour runs the other way round (6.3): a third of the way in, details and accents have begun to recolour and anchors have not; all done by the end', () => {
    let early = 0, anchorsSeen = 0, anchorsStarted = 0, detailsSeen = 0;
    for (const seed of [7101, 7102, 7103, 7104, 7105, 7106]) {
      const scene = setup('axis-thrust', { duration: W, seed });
      SceneConfig.update({ palette: 'Proun — pale graphite' });  // every shape changes colour
      const all = meshes(scene);
      Tween.update(0.3 * W);
      all.forEach((m) => {
        const role = m.userData.role; const f = m.userData.front.uFront.value;
        if (role === 'anchor') { anchorsSeen++; if (f > 0) anchorsStarted++; }
        if (role === 'detail' || role === 'accent') { detailsSeen++; if (f > 0) early++; }
      });
      Tween.update(0.71 * W);                                    // past the end of the window
      all.forEach((m) => { expect(m.userData.front.uFront.value, m.userData.role).toBe(1); expect(Tween.targetOf(m)).toBeNull(); });
      expect(Rhythm.duration).toBe(W);                           // the event clock is given the same window ...
      Rhythm.update(1.01 * W);
      expect(Rhythm.phase).toBe(1);                              // ... and is through it when the tweens are
    }
    expect(anchorsSeen).toBeGreaterThan(0); expect(detailsSeen).toBeGreaterThan(0);
    expect(anchorsStarted).toBe(0);
    expect(early).toBeGreaterThan(0);
  });

  it('is the same every time: the same seed gives the same positions at the same moment', () => {
    const snap = () => {
      const scene = setup('central-cluster', { duration: W, seed: 1234 });
      SceneConfig.update({ seed: 8080 });
      Tween.update(0.2 * W);
      return meshes(scene).map((m) => [m.userData.role, ...m.position.toArray().map((v) => Math.round(v * 1e6) / 1e6)]);
    };
    expect(snap()).toEqual(snap());
  });

  it('shows no jump in a change interrupted by another, on any shape, at any moment of the stagger', () => {
    const scene = setup('axis-thrust', { duration: W });
    SceneConfig.update({ seed: 6001 });
    for (const frac of [0.02, 0.07, 0.15, 0.3, 0.5]) {
      Tween.update(frac * W);
      const snapBefore = new Map(meshes(scene).map((m) => [m, [m.position.clone(), m.quaternion.clone()]]));
      SceneConfig.update({ seed: 6001 + Math.round(frac * 1000) });
      Tween.update(0);                                         // apply the new tweens at their first frame
      meshes(scene).forEach((m) => {
        const was = snapBefore.get(m);
        if (!was) return;                                      // a shape that is new in this change starts as a speck
        expect(m.position.distanceTo(was[0]), `${m.userData.role} at ${frac}`).toBeLessThan(1e-6);
        expect(m.quaternion.angleTo(was[1]), `${m.userData.role} at ${frac}`).toBeLessThan(1e-6);
      });
    }
    flush();
  });
});

describe('shapes still leaving from a slow change leave with the next one (found in use: Exhibition, then Dev)', () => {
  beforeEach(() => { Rhythm.reset(); });

  it('after a 60 s change interrupted by a palette and a strategy change, a Dev change clears the old shapes within its own duration', () => {
    const scene = setup('axis-thrust', { duration: 60_000 });
    SceneConfig.update({ seed: 2001 });                       // a new composition, slowly
    Tween.update(5000);
    SceneConfig.update({ palette: 'Proun — pale graphite' }); // ... and a new palette
    Tween.update(5000);
    SceneConfig.update({ composition: { strategy: 'disc-beams' } }); // ... and another strategy, still within the minute
    Tween.update(5000);
    const slow = meshes(scene).length;
    SceneConfig.update({ time: { durationMs: 1100, holdMs: 2900 } }); // switch to Dev
    SceneConfig.update({ seed: 2002 });                       // a new composition, quickly
    Tween.update(1100 + 50);
    const quick = meshes(scene).filter((m) => !m.userData.disposed);
    const stillThere = quick.length;
    flush();
    const settled = meshes(scene).filter((m) => !m.userData.disposed).length;
    expect(slow).toBeGreaterThan(settled);                    // there were ghosts to clear
    expect(stillThere).toBe(settled);                         // and the Dev change cleared them with itself, not a minute later
    // everything that is gone was disposed, nothing is left half-way
    expect(scene.children.filter((c) => c.isMesh).length).toBe(settled);
  });

  it('also with the legacy generator (a slot-by-slot change after a strategy change)', () => {
    const scene = setup('axis-thrust', { duration: 60_000 });
    SceneConfig.update({ composition: { strategy: 'legacy' } });
    Tween.update(5000);
    const slow = meshes(scene).length;
    SceneConfig.update({ time: { durationMs: 1100, holdMs: 2900 } });
    SceneConfig.update({ seed: 2003 });
    Tween.update(1150);
    const quick = meshes(scene).filter((m) => !m.userData.disposed).length;
    flush();
    const settled = meshes(scene).filter((m) => !m.userData.disposed).length;
    expect(slow).toBeGreaterThanOrEqual(settled);
    expect(quick).toBe(settled);
  });

  it('a ghost with no more than the new duration left is left alone, and a change of the same length changes nothing', () => {
    const scene = setup('axis-thrust', { duration: 1000 });
    SceneConfig.update({ composition: { strategy: 'disc-beams' } });
    const before = meshes(scene).length;
    Tween.update(400);
    SceneConfig.update({ seed: 3001 });                       // same 1 s duration: the 600 ms the ghosts have left stay 600 ms
    Tween.update(599);
    expect(meshes(scene).length).toBeLessThanOrEqual(before + 4);
    flush();
    expect(scene.children.filter((c) => c.isMesh).length).toBe(meshes(scene).filter((m) => !m.userData.disposed).length);
  });
});

describe('Composition tells the shared clock the cycle (6.1)', () => {
  beforeEach(() => { Rhythm.reset(); });

  it.each(['legacy', 'axis-thrust'])('%s: a change starts an event whose period is the transition plus the hold when Auto is on, and none when it is off', (strategy) => {
    setup(strategy, { duration: 1500 });
    SceneConfig.update({ time: { autoAdvance: true, holdMs: 8500 } });
    Rhythm.reset();
    SceneConfig.update({ seed: 4242 });
    flush();
    expect(Rhythm.events).toBe(1);
    expect(Rhythm.duration).toBe(1500);
    expect(Rhythm.interval).toBe(10_000);
    SceneConfig.update({ time: { autoAdvance: false } });
    Rhythm.reset();
    SceneConfig.update({ seed: 4243 });
    flush();
    expect(Rhythm.interval).toBe(0);
  });
});

describe.each(['axis-thrust', 'disc-beams', 'central-cluster'])('Composition under %s: an advance', (strategy) => {
  beforeEach(() => { Rhythm.reset(); });

  it('removes nothing at once: shapes with no counterpart shrink away instead of vanishing', () => {
    const scene = setup(strategy);
    const before = meshes(scene);
    SceneConfig.update({ seed: 4242 });
    const during = meshes(scene);
    before.forEach((m) => { expect(during).toContain(m); expect(m.userData.disposed).toBeFalsy(); });
    expect(during.length).toBeGreaterThanOrEqual(before.length);
  });

  it('new shapes start as a speck at their own place and grow; nothing is full size before it should be', () => {
    const scene = setup(strategy);
    const before = new Set(meshes(scene));
    SceneConfig.update({ seed: 4242 });
    const arrivals = meshes(scene).filter((m) => !before.has(m));
    arrivals.forEach((m) => {
      expect(Math.max(m.scale.x, m.scale.y, m.scale.z), key(m)).toBeLessThan(0.02);
      expect(m.visible).toBe(true);
    });
    Tween.update(500); // part-way: growing, not yet full size
    arrivals.forEach((m) => expect(Math.max(m.scale.x, m.scale.y, m.scale.z)).toBeLessThan(5));
    flush();
    arrivals.forEach((m) => expect(Math.max(m.scale.x, m.scale.y, m.scale.z), key(m)).toBeGreaterThan(0.05));
  });

  it('when it ends, the scene is exactly the new composition: every shape at its place, no leftovers, nothing leaked', () => {
    for (const seed of [4242, 7, 91, 123456]) {
      const scene = setup(strategy);
      const before = meshes(scene);
      SceneConfig.update({ seed });
      const during = meshes(scene);
      flush();
      const after = meshes(scene);
      const layout = layoutNow();
      expect(after).toHaveLength(layout.length);
      // every layout entry has a mesh of its type at exactly its position, size and orientation
      const left = [...after];
      layout.forEach((e) => {
        const i = left.findIndex((m) => key(m) === e.type
          && m.position.distanceTo(new THREE.Vector3(...e.position)) < 1e-9
          && m.scale.distanceTo(new THREE.Vector3(...e.scale)) < 1e-9);
        expect(i, `${strategy} seed ${seed}: ${e.type} ${e.role}`).toBeGreaterThanOrEqual(0);
        left.splice(i, 1);
      });
      expect(left).toHaveLength(0);
      // the ones that went were disposed and are out of the scene; the ones that stayed were not disposed
      during.filter((m) => !after.includes(m)).forEach((m) => expect(m.userData.disposed).toBe(true));
      after.forEach((m) => expect(m.userData.disposed).toBeFalsy());
      expect(before.filter((m) => !after.includes(m)).every((m) => m.userData.disposed)).toBe(true);
    }
  });

  it('most shapes glide and keep their role (a beam stays a beam), and the rest are a minority', () => {
    let glides = 0, sameRole = 0, total = 0;
    for (let i = 0; i < 25; i++) {
      const scene = setup(strategy, { seed: 100 + i });
      const before = new Map(meshes(scene).map((m) => [m, m.userData.role]));
      SceneConfig.update({ seed: 5000 + i });
      const after = meshes(scene).filter((m) => !m.userData.disposed);
      flush();
      const stayed = meshes(scene).filter((m) => before.has(m));
      stayed.forEach((m) => { glides++; if (before.get(m) === m.userData.role) sameRole++; });
      total += meshes(scene).length;
    }
    expect(glides / total).toBeGreaterThan(0.6);
    expect(sameRole / glides).toBeGreaterThan(0.8);
  });

  it('a second advance in the middle of the first still ends on the right scene, without leaks', () => {
    const scene = setup(strategy);
    SceneConfig.update({ seed: 11 });
    Tween.update(300);
    SceneConfig.update({ seed: 22 });
    Tween.update(300);
    SceneConfig.update({ seed: 33 });
    flush();
    const after = meshes(scene);
    expect(after).toHaveLength(layoutNow().length);
    after.forEach((m) => expect(m.userData.disposed).toBeFalsy());
    // nothing is left shrinking in the scene
    expect(after.every((m) => Math.max(m.scale.x, m.scale.y, m.scale.z) > 0.05)).toBe(true);
  });

  it('a locked type keeps exactly its shapes through an advance, and everything else recomposes around them', () => {
    const scene = setup(strategy, { seed: 77 });
    const layout = layoutNow();
    const type = layout[0].type;
    const frozen = meshes(scene).filter((m) => key(m) === type).map((m) => m.position.toArray());
    expect(Composition.lock(type)).toBe(true);
    SceneConfig.update({ seed: 999 });
    flush();
    const after = meshes(scene).filter((m) => key(m) === type).map((m) => m.position.toArray());
    expect(after).toHaveLength(frozen.length);
    const sort = (a) => [...a].sort((x, y) => x[0] - y[0] || x[1] - y[1] || x[2] - y[2]);
    sort(after).forEach((p, i) => p.forEach((v, j) => expect(v).toBeCloseTo(sort(frozen)[i][j], 6)));
    expect(meshes(scene)).toHaveLength(layoutNow().length);
  });
});

describe('Composition: the legacy generator is unchanged', () => {
  it('an advance creates and removes nothing, and every shape eases to its slot', () => {
    const scene = setup('legacy', { counts: { rod: 0, beam: 0, segment: 0, crescent: 0, frame: 0, ring: 0 } });
    const before = meshes(scene);
    SceneConfig.update({ seed: 4242 });
    const during = meshes(scene);
    expect(during).toEqual(before);
    during.forEach((m) => expect(Math.max(m.scale.x, m.scale.y, m.scale.z)).toBeGreaterThan(0.05)); // none shrunk to a speck
    flush();
    const layout = layoutNow();
    layout.forEach((e) => {
      const m = meshes(scene).find((x) => key(x) === e.type && x.position.distanceTo(new THREE.Vector3(...e.position)) < 1e-9);
      expect(m, e.type).toBeTruthy();
    });
    expect(meshes(scene)).toHaveLength(layout.length);
  });
});

describe('Composition: switching strategy', () => {
  it('legacy -> a strategy and back never pops either: old shapes shrink and new ones grow, ending on the exact composition', () => {
    const scene = setup('legacy', { counts: { rod: 0, beam: 0, segment: 0, crescent: 0, frame: 0, ring: 0 } });
    const before = meshes(scene);
    SceneConfig.update({ composition: { strategy: 'disc-beams' } });
    before.forEach((m) => expect(meshes(scene)).toContain(m));
    flush();
    expect(meshes(scene)).toHaveLength(layoutNow().length);
    SceneConfig.update({ composition: { strategy: 'legacy' } });
    flush();
    expect(meshes(scene)).toHaveLength(layoutNow().length);
    meshes(scene).forEach((m) => expect(m.userData.disposed).toBeFalsy());
  });

  it('excluding a type under a strategy (count 0) shrinks that type away and leaves no trace of it', () => {
    const scene = setup('axis-thrust', { seed: 5 });
    const type = key(meshes(scene)[0]); // whichever type this scene has
    expect(meshes(scene).some((m) => key(m) === type)).toBe(true);
    const before = meshes(scene).filter((m) => key(m) === type);
    SceneConfig.update({ shapes: { [type]: { count: 0 } } });
    before.forEach((m) => expect(meshes(scene)).toContain(m)); // still there, shrinking
    flush();
    expect(meshes(scene).some((m) => key(m) === type)).toBe(false);
    before.forEach((m) => expect(m.userData.disposed).toBe(true));
    expect(meshes(scene)).toHaveLength(layoutNow().length);
  });
});


describe('Composition: the paint of a shape does not depend on history', () => {
  /** each mesh's paint seed, keyed by the layout entry it ends up as (type, role, ordinal) */
  function paintByPart(scene) {
    const layout = layoutNow();
    const slots = paintSlots(layout);
    const left = meshes(scene);
    const out = new Map();
    layout.forEach((e, i) => {
      const m = left.find((x) => key(x) === e.type && x.position.distanceTo(new THREE.Vector3(...e.position)) < 1e-9);
      out.set(`${e.type}|${e.role}|${slots[i]}`, m.userData.front.uSeed.value.toArray());
    });
    return out;
  }

  for (const strategy of ['axis-thrust', 'disc-beams', 'central-cluster']) {
    it(`${strategy}: a scene reached through a chain of advances has exactly the paint of a fresh load of the same config`, () => {
      const scene = setup(strategy, { seed: 10 });
      for (const seed of [11, 12, 13, 14, 15, 99]) { SceneConfig.update({ seed }); Tween.update(400); }
      flush();
      const lived = paintByPart(scene);
      const fresh = paintByPart(setup(strategy, { seed: 99 }));
      expect([...lived.keys()].sort()).toEqual([...fresh.keys()].sort());
      for (const [k, seed] of fresh) expect(lived.get(k), k).toEqual(seed);
    });

    it(`${strategy}: every shape's paint is the paint of its own part (type, role, ordinal)`, () => {
      const scene = setup(strategy, { seed: 10 });
      SceneConfig.update({ seed: 4242 });
      flush();
      const layout = layoutNow();
      const slots = paintSlots(layout);
      paintByPart(scene).forEach((seed, k) => {
        const [type, , slot] = k.split('|');
        expect(seed).toEqual(paintSeed(type, Number(slot)));
      });
      expect(slots.length).toBe(layout.length);
    });
  }

  it('legacy paint is its slot paint, as it always was, even after a visit to a strategy', () => {
    const counts = { rod: 0, beam: 0, segment: 0, crescent: 0, frame: 0, ring: 0 };
    const scene = setup('legacy', { counts, seed: 21 });
    SceneConfig.update({ composition: { strategy: 'axis-thrust' } });
    flush();
    SceneConfig.update({ composition: { strategy: 'legacy' } });
    flush();
    layoutNow().forEach((e) => {
      const m = meshes(scene).find((x) => key(x) === e.type && x.position.distanceTo(new THREE.Vector3(...e.position)) < 1e-9);
      expect(m.userData.front.uSeed.value.toArray(), `${e.type}:${e.index}`).toEqual(paintSeed(e.type, e.index));
    });
  });

  it('a same-part glide keeps its paint untouched (no flicker): most shapes keep the very same seed value', () => {
    let kept = 0, total = 0;
    for (let i = 0; i < 25; i++) {
      const scene = setup('axis-thrust', { seed: 300 + i });
      const before = new Map(meshes(scene).map((m) => [m, m.userData.front.uSeed.value.toArray().join()]));
      SceneConfig.update({ seed: 9000 + i });
      flush();
      meshes(scene).filter((m) => before.has(m)).forEach((m) => { total++; if (m.userData.front.uSeed.value.toArray().join() === before.get(m)) kept++; });
    }
    expect(kept / total).toBeGreaterThan(0.6);
  });
});


describe('Composition.diagnostics', () => {
  it('reports on the current composition: it is diagnoseLayout of the live layout, and follows the scene', () => {
    setup('axis-thrust', { seed: 31 });
    const a = Composition.diagnostics();
    expect(a).toEqual(diagnoseLayout({ entries: layoutNow(), shapeDefs: shapeRegistry, view: { depthAxis: Billboard.direction(), billboard: Billboard.get() } }));
    expect(a.hasPlan).toBe(true);
    expect(a.shapes).toBe(layoutNow().length);
    SceneConfig.update({ composition: { strategy: 'legacy' } });
    const b = Composition.diagnostics();
    expect(b.hasPlan).toBe(false);
    expect(b.shapes).toBe(layoutNow().length);
  });
});


const { toneModeFor } = await import('../src/texture/tone.js');
const { hasShadow } = await import('../src/texture/shadow.js');
const seedsWhere = (strategy, pred, n) => { const out = []; for (let s = 1; out.length < n && s < 9000; s++) if (pred(toneModeFor(s, strategy))) out.push(s); return out; };
const shadowOfMesh = (scene, entry) => {
  const mesh = meshes(scene).find((m) => key(m) === entry.type && m.position.distanceTo(new THREE.Vector3(...entry.position)) < 1e-6);
  return mesh && mesh.userData.shadow ? mesh.userData.shadow.mesh : null;
};

describe.each(['axis-thrust', 'disc-beams', 'central-cluster'])('Composition under %s: graphic shadow planes', (strategy) => {
  beforeEach(() => { Rhythm.reset(); });

  it('carries one on discs, flat forms and beams that are not details, except in pale scenes', () => {
    let shown = 0;
    for (const mode of ['faceted', 'subtle', 'pale']) {
      for (const seed of seedsWhere(strategy, (m) => m === mode, 6)) {
        const scene = setup(strategy, { seed });
        for (const entry of layoutNow().filter((e) => hasShadow(e.type))) {
          const sh = shadowOfMesh(scene, entry);
          expect(sh, `${entry.type} has a shadow plane`).not.toBeNull();
          const wanted = mode !== 'pale' && entry.role !== 'detail';
          expect(sh.visible, `${strategy} ${mode} seed ${seed} ${entry.type} ${entry.role}`).toBe(wanted);
          if (wanted) shown++;
        }
        meshes(scene).filter((m) => !hasShadow(key(m))).forEach((m) => expect(m.userData.shadow, key(m)).toBeUndefined());
      }
    }
    expect(shown).toBeGreaterThan(0);
  });

  it('a change to a pale scene tucks every shadow back behind its parent; a change from one lets them out', () => {
    const [calm] = seedsWhere(strategy, (m) => m !== 'pale', 1), [pale] = seedsWhere(strategy, (m) => m === 'pale', 1);
    const scene = setup(strategy, { seed: calm });
    SceneConfig.update({ seed: pale }); flush();
    meshes(scene).forEach((m) => { if (m.userData.shadow) expect(m.userData.shadow.mesh.visible, key(m)).toBe(false); });
    SceneConfig.update({ seed: calm }); flush();
    const any = meshes(scene).some((m) => m.userData.shadow && m.userData.shadow.mesh.visible);
    expect(any).toBe(true);
  });
});

describe('Composition: the legacy generator has no shadow planes', () => {
  it('none is visible', () => {
    const scene = setup('legacy');
    meshes(scene).forEach((m) => { if (m.userData.shadow) expect(m.userData.shadow.mesh.visible, key(m)).toBe(false); });
  });
});


const { HIGHLIGHT, hasHighlight: hasHi } = await import('../src/texture/highlight.js');
describe.each(['axis-thrust', 'disc-beams', 'central-cluster'])('Composition under %s: selective highlights', (strategy) => {
  beforeEach(() => { Rhythm.reset(); });
  const lit = (scene) => meshes(scene).filter((m) => m.userData.front.uHiAmt.value === 1);

  it('lights the anchor and one or two other major forms in faceted and subtle scenes, never a detail or an ineligible type', () => {
    let seen = 0;
    for (const mode of ['faceted', 'subtle']) {
      for (const seed of seedsWhere(strategy, (m) => m === mode, 8)) {
        const scene = setup(strategy, { seed });
        const on = lit(scene);
        on.forEach((m) => { expect(hasHi(key(m)), key(m)).toBe(true); expect(m.userData.role).not.toBe('detail'); });
        expect(on.length).toBeLessThanOrEqual(1 + HIGHLIGHT.others + 1);
        meshes(scene).filter((m) => !hasHi(key(m))).forEach((m) => expect(m.userData.front.uHiAmt.value).toBe(0));
        seen += on.length;
      }
    }
    expect(seen).toBeGreaterThan(0);
  });

  it('lights nothing in pale scenes, and a change to or from one fades it', () => {
    const [calm] = seedsWhere(strategy, (m) => m !== 'pale', 1), [pale] = seedsWhere(strategy, (m) => m === 'pale', 1);
    const scene = setup(strategy, { seed: pale });
    expect(lit(scene).length).toBe(0);
    SceneConfig.update({ seed: calm }); flush();
    expect(lit(scene).length).toBeGreaterThan(0);
    SceneConfig.update({ seed: pale }); flush();
    expect(lit(scene).length).toBe(0);
  });
});

describe('Composition: the legacy generator has no highlights', () => {
  it('none is lit', () => {
    const scene = setup('legacy');
    meshes(scene).forEach((m) => expect(m.userData.front.uHiAmt.value, key(m)).toBe(0));
  });
});


describe.each(['axis-thrust', 'disc-beams', 'central-cluster'])('Composition under %s: the paint grain rides the colour front', (strategy) => {
  beforeEach(() => { Rhythm.reset(); });
  const seedOf = (m) => m.userData.front.uSeed.value.clone();
  it('a shape that takes another part\'s paint keeps the old seed under the front; one that keeps its part, and a new one, show only their own', () => {
    let changed = 0, kept = 0;
    // two changes in a row, so the old seed is not just the one the mesh was born with
    for (const [a, b, c] of [[11, 159, 455], [159, 455, 11], [455, 11, 159], [7, 90, 31]]) {
      const scene = setup(strategy, { seed: a });
      SceneConfig.update({ seed: b }); flush();
      const before = new Map(meshes(scene).map((m) => [m, seedOf(m)]));
      SceneConfig.update({ seed: c });
      for (const m of meshes(scene)) {
        const f = m.userData.front;
        if (!before.has(m)) { expect(f.uSeedFrom.value.equals(f.uSeed.value)).toBe(true); continue; }
        if (before.get(m).equals(f.uSeed.value)) { expect(f.uSeedFrom.value.equals(f.uSeed.value)).toBe(true); kept++; }
        else { expect(f.uSeedFrom.value.equals(before.get(m))).toBe(true); changed++; }
      }
    }
    expect(changed).toBeGreaterThan(0);
    expect(kept).toBeGreaterThan(0);
  });
  it('a change that interrupts another keeps the seed in force at that moment, not the one before it', () => {
    const scene = setup(strategy, { seed: 11 });
    SceneConfig.update({ seed: 159 });
    const mid = new Map(meshes(scene).map((m) => [m, seedOf(m)]));
    SceneConfig.update({ seed: 455 });
    for (const m of meshes(scene)) {
      if (!mid.has(m)) continue;
      const f = m.userData.front;
      expect(f.uSeedFrom.value.equals(mid.get(m)), 'old grain is the one in force when interrupted').toBe(true);
    }
  });
});
