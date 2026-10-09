import { describe, it, expect, vi, beforeEach } from 'vitest';
import * as THREE from 'three';

vi.mock('../src/texture/PigmentLayer.js', async () => {
  const T = await import('three');
  return { pickStructureTexture: () => new T.Texture() };
});

// Composition, the config store and Tween all hold module state: load a
// fresh copy of the app's modules for every test.
let m;
beforeEach(async () => {
  vi.resetModules();
  const [{ Composition }, { SceneConfig, SceneHistory }, { Tween }, { Billboard }, { Palette }, { generateLayout }, { shapeRegistry }] =
    await Promise.all([
      import('../src/core/Composition.js'),
      import('../src/config/store.js'),
      import('../src/core/Tween.js'),
      import('../src/core/Billboard.js'),
      import('../src/palette/Palette.js'),
      import('../src/generator/generate.js'),
      import('../src/shapes/registry.js')
    ]);
  const camera = new THREE.OrthographicCamera(-4, 4, 3, -3, 0.1, 100);
  camera.position.set(4.2, 3.4, 5.2);
  camera.lookAt(0, 0, 0);
  Billboard.computeFromCamera(camera);
  const scene = new THREE.Scene();
  m = { Composition, SceneConfig, SceneHistory, Tween, Palette, generateLayout, shapeRegistry, Billboard, scene };
  Composition.init(scene);
});

const meshesOf = (type) => m.scene.children.filter((c) => c.userData.shapeType === type);
const settle = () => m.Tween.update(100000);
const expected = () => m.generateLayout({
  config: m.SceneConfig.get(),
  palette: m.Palette.active(),
  shapeDefs: m.shapeRegistry,
  view: { depthAxis: m.Billboard.direction(), billboard: m.Billboard.get() }
});
// every mesh in the scene, as plain data comparable with a LayoutEntry
const sceneState = () => m.shapeRegistry.flatMap((s) => meshesOf(s.type).map((mesh, index) => ({
  type: s.type, index,
  position: mesh.position.toArray(),
  scale: mesh.scale.toArray(),
  hex: '#' + mesh.userData.baseColor.getHexString()
})));
const sameAsLayout = (layout) => {
  const state = sceneState();
  expect(state).toHaveLength(layout.length);
  layout.forEach((e) => {
    const got = state.find((s) => s.type === e.type && s.index === e.index);
    expect(got, `${e.type}:${e.index} present`).toBeTruthy();
    got.position.forEach((v, i) => expect(v).toBeCloseTo(e.position[i], 4));
    got.scale.forEach((v, i) => expect(v).toBeCloseTo(e.scale[i], 4));
    // base colors round-trip through THREE's linear space; compare as colors
    expect(new THREE.Color(got.hex).getHex()).toBe(new THREE.Color(e.hex).getHex());
  });
};

describe('init', () => {
  it('creates the configured number of instances per shape, visible', () => {
    const shapes = m.SceneConfig.get().shapes;
    let total = 0;
    m.shapeRegistry.forEach((s) => {
      expect(meshesOf(s.type)).toHaveLength(shapes[s.type].count);
      meshesOf(s.type).forEach((mesh) => expect(mesh.visible).toBe(true));
      total += shapes[s.type].count;
    });
    expect(m.scene.children).toHaveLength(total);
  });

  it('shapes that declare defaults start that way (the rod starts off)', () => {
    expect(m.SceneConfig.get().shapes.rod.count).toBe(0);
    expect(meshesOf('rod')).toHaveLength(0);
    expect(m.SceneConfig.get().shapes.sphere.count).toBe(1);
  });

  it('starts out exactly equal to generate(config)', () => {
    sameAsLayout(expected());
  });
});

describe('advance (new seed)', () => {
  it('changes the seed and eases the whole scene to generate(config)', () => {
    const seed = m.SceneConfig.get().seed;
    const before = JSON.stringify(sceneState());
    m.Composition.advance();
    expect(m.SceneConfig.get().seed).not.toBe(seed);
    settle();
    expect(JSON.stringify(sceneState())).not.toBe(before);
    sameAsLayout(expected());
  });

  it('uses the configured transition duration', () => {
    m.SceneConfig.update({ time: { durationMs: 2000 } });
    m.Composition.advance();
    const mesh = meshesOf('sphere')[0];
    const end = new THREE.Vector3(...expected().find((e) => e.type === 'sphere').position);
    expect(mesh.position.distanceTo(end)).toBeGreaterThan(0.1); // really has somewhere to go
    m.Tween.update(1000);                                       // halfway through 2000ms
    expect(mesh.position.distanceTo(end)).toBeGreaterThan(1e-3);
    m.Tween.update(1100);                                       // past the end
    expect(mesh.position.equals(end)).toBe(true);
  });

  it('changing settings alone does not move anything until the next advance', () => {
    const before = JSON.stringify(sceneState());
    m.SceneConfig.update({ shapes: { sphere: { spread: 2, sizeMin: 3, sizeMax: 4 } } });
    settle();
    expect(JSON.stringify(sceneState())).toBe(before);
    m.Composition.advance();
    settle();
    sameAsLayout(expected());
  });

  it('a palette-only change recolors in place (same positions, new palette)', () => {
    const other = m.Palette.names().find((n) => n !== m.SceneConfig.get().palette);
    const positions = sceneState().map((s) => s.position);
    m.SceneConfig.update({ palette: other }); // no new seed
    settle();
    expect(sceneState().map((s) => s.position)).toEqual(positions);
    sameAsLayout(expected()); // colors come from the new palette
  });

  it('a palette change recolors from the new palette in the same transition', () => {
    const other = m.Palette.names().find((n) => n !== m.SceneConfig.get().palette);
    m.Composition.advance({ palette: other });
    settle();
    expect(m.SceneConfig.get().palette).toBe(other);
    const accents = m.Palette.get(other).accents.map((h) => new THREE.Color(h).getHex());
    m.scene.children.forEach((c) => {
      expect(accents).toContain(new THREE.Color('#' + c.userData.baseColor.getHexString()).getHex());
    });
  });
});

describe('seeds restore compositions', () => {
  it('replace() with a saved config reproduces the exact composition', () => {
    m.Composition.advance();
    settle();
    const saved = m.SceneConfig.toJSON();
    const savedState = JSON.stringify(sceneState());

    m.Composition.advance();
    settle();
    expect(JSON.stringify(sceneState())).not.toBe(savedState);

    m.SceneConfig.replace(saved);
    settle();
    expect(JSON.stringify(sceneState())).toBe(savedState);
  });

  it('replace() re-lays-out even when the seed is unchanged and the scene is stale', () => {
    // a settings change does not move anything, so the scene now shows the
    // OLD layout while the config describes a different one
    m.SceneConfig.update({ shapes: { sphere: { spread: 0, count: 1 }, plane: { spread: 0 } } });
    settle();
    expect(() => sameAsLayout(expected())).toThrow(); // genuinely stale

    m.SceneConfig.replace(m.SceneConfig.toJSON());    // loading "this" preset must fix it
    settle();
    sameAsLayout(expected());
  });

  it('a legacy preset without a seed loads with a fresh one (re-roll, as before)', () => {
    const old = m.SceneConfig.get().seed;
    const legacy = m.SceneConfig.toJSON();
    delete legacy.seed;
    m.SceneConfig.replace(legacy);
    expect(m.SceneConfig.get().seed).not.toBe(old);
    settle();
    sameAsLayout(expected());
  });
});

describe('counts', () => {
  it('growing adds instances at their generated positions, without disturbing existing ones', () => {
    const existing = meshesOf('cube-fixed')[0];
    const pos = existing.position.clone();
    m.SceneConfig.update({ shapes: { 'cube-fixed': { count: 4 } } });
    expect(meshesOf('cube-fixed')).toHaveLength(4);
    expect(existing.position.equals(pos)).toBe(true);
    // only the NEW instances are guaranteed to sit at their generated spot:
    // collision resolution over the larger set may legitimately want to move
    // an existing one, but growing never moves anything by itself
    const want = expected().filter((e) => e.type === 'cube-fixed');
    meshesOf('cube-fixed').slice(1).forEach((mesh, i) => {
      mesh.position.toArray().forEach((v, k) => expect(v).toBeCloseTo(want[i + 1].position[k], 4));
    });
  });

  it('new instances honor the type\'s visibility', () => {
    m.SceneConfig.update({ shapes: { plane: { visible: false } } });
    m.SceneConfig.update({ shapes: { plane: { count: 3 } } });
    meshesOf('plane').forEach((mesh) => expect(mesh.visible).toBe(false));
  });

  it('shrinking removes from the scene, disposes GPU resources and cancels tweens', () => {
    m.SceneConfig.update({ shapes: { sphere: { count: 3 } } });
    m.Composition.advance(); // put tweens in flight on all spheres
    const doomed = meshesOf('sphere')[2];
    const geoDispose = vi.spyOn(doomed.geometry, 'dispose');
    const matDispose = vi.spyOn(doomed.material, 'dispose');

    m.SceneConfig.update({ shapes: { sphere: { count: 1 } } });
    expect(meshesOf('sphere')).toHaveLength(1);
    expect(m.scene.children).not.toContain(doomed);
    expect(geoDispose).toHaveBeenCalledTimes(1);
    expect(matDispose).toHaveBeenCalledTimes(1);

    const frozenAt = doomed.position.clone();
    m.Tween.update(100000); // would move it if its tween were still alive
    expect(doomed.position.equals(frozenAt)).toBe(true);
  });

  it('count 0 empties a type entirely; growing again works', () => {
    m.SceneConfig.update({ shapes: { circle: { count: 0 } } });
    expect(meshesOf('circle')).toHaveLength(0);
    m.SceneConfig.update({ shapes: { circle: { count: 2 } } });
    expect(meshesOf('circle')).toHaveLength(2);
  });
});

describe('visibility', () => {
  it('toggles every instance of a type', () => {
    m.SceneConfig.update({ shapes: { triangle: { count: 3 } } });
    m.SceneConfig.update({ shapes: { triangle: { visible: false } } });
    meshesOf('triangle').forEach((mesh) => expect(mesh.visible).toBe(false));
    m.SceneConfig.update({ shapes: { triangle: { visible: true } } });
    meshesOf('triangle').forEach((mesh) => expect(mesh.visible).toBe(true));
  });

  it('hidden shapes keep evolving', () => {
    m.SceneConfig.update({ shapes: { triangle: { visible: false } } });
    const mesh = meshesOf('triangle')[0];
    const before = mesh.position.clone();
    m.Composition.advance();
    settle();
    expect(mesh.position.equals(before)).toBe(false);
  });
});

describe('determinism end to end', () => {
  it('never uses Math.random while advancing or restoring', () => {
    // (growing is excluded: three.js itself draws UUIDs from Math.random when
    // it constructs a mesh; the seed source is crypto.getRandomValues)
    const spy = vi.spyOn(Math, 'random').mockImplementation(() => { throw new Error('Math.random used'); });
    expect(() => {
      m.Composition.advance();
      m.SceneConfig.replace(m.SceneConfig.toJSON());
      m.Composition.advance({ palette: m.Palette.names()[1] });
      settle();
    }).not.toThrow();
    spy.mockRestore();
  });
});


describe('locking a shape type', () => {
  // a scene with something to lock: 3 spheres + 2 fixed cubes, settled after an advance
  const typeState = (type) => JSON.stringify(sceneState().filter((e) => e.type === type));
  beforeEach(() => {
    m.SceneConfig.update({ shapes: { sphere: { count: 3 }, 'cube-fixed': { count: 2 } } });
    m.Composition.advance();
    settle();
  });

  it('freezes exactly what is on screen — nothing moves at the moment of locking', () => {
    const before = JSON.stringify(sceneState());
    expect(m.Composition.lock('sphere')).toBe(true);
    settle();
    expect(JSON.stringify(sceneState())).toBe(before);
    expect(m.SceneConfig.get().shapes.sphere.locked).toHaveLength(3);
    expect(m.SceneConfig.get().shapes.sphere.count).toBe(3);
  });

  it('later advances re-roll everything else but the locked type stays exactly put', () => {
    m.Composition.lock('sphere');
    const frozen = typeState('sphere');
    const cubes = typeState('cube-fixed');
    for (let i = 0; i < 4; i++) {
      m.Composition.advance();
      settle();
      expect(typeState('sphere')).toBe(frozen);
    }
    expect(typeState('cube-fixed')).not.toBe(cubes); // the others did re-roll
  });

  it('the scene still equals generate(config) with a lock in place', () => {
    m.Composition.lock('sphere');
    m.Composition.advance();
    settle();
    sameAsLayout(expected());
  });

  it('a locked type keeps its colors when the palette changes; the rest recolor', () => {
    m.Composition.lock('sphere');
    const frozen = typeState('sphere');
    const other = m.Palette.names().find((n) => n !== m.SceneConfig.get().palette);
    m.Composition.advance({ palette: other });
    settle();
    expect(typeState('sphere')).toBe(frozen);
    const accents = m.Palette.get(other).accents.map((h) => new THREE.Color(h).getHex());
    meshesOf('cube-fixed').forEach((c) => {
      expect(accents).toContain(new THREE.Color('#' + c.userData.baseColor.getHexString()).getHex());
    });
  });

  it('the count cannot change while locked (the instances ARE the count)', () => {
    m.Composition.lock('sphere');
    m.SceneConfig.update({ shapes: { sphere: { count: 9 } } });
    expect(meshesOf('sphere')).toHaveLength(3);
    m.SceneConfig.update({ shapes: { sphere: { count: 0 } } });
    expect(meshesOf('sphere')).toHaveLength(3);
  });

  it('visibility still works on a locked type', () => {
    m.Composition.lock('sphere');
    m.SceneConfig.update({ shapes: { sphere: { visible: false } } });
    meshesOf('sphere').forEach((mesh) => expect(mesh.visible).toBe(false));
    m.SceneConfig.update({ shapes: { sphere: { visible: true } } });
    meshesOf('sphere').forEach((mesh) => expect(mesh.visible).toBe(true));
  });

  it('locking mid-transition freezes where the shapes are HEADED, not a half-way frame', () => {
    m.Composition.advance();            // tweens now in flight, nothing settled
    m.Tween.update(100);                // a little way in
    const destination = expected().filter((e) => e.type === 'sphere');
    expect(m.Composition.lock('sphere')).toBe(true);
    settle();
    const spheres = sceneState().filter((e) => e.type === 'sphere');
    expect(spheres).toHaveLength(3);
    destination.forEach((e, i) => {
      spheres[i].position.forEach((v, k) => expect(v).toBeCloseTo(e.position[k], 4));
      expect(new THREE.Color(spheres[i].hex).getHex()).toBe(new THREE.Color(e.hex).getHex());
    });
    const frozen = typeState('sphere');
    m.Composition.advance();
    settle();
    expect(typeState('sphere')).toBe(frozen);
  });

  it('unlocking returns the type to the seed at the next advance (and not before)', () => {
    m.Composition.lock('sphere');
    const frozen = typeState('sphere');
    m.Composition.unlock('sphere');
    settle();
    expect(typeState('sphere')).toBe(frozen);       // nothing moves on unlock either
    expect(m.SceneConfig.get().shapes.sphere.locked).toBeNull();
    m.Composition.advance();
    settle();
    expect(typeState('sphere')).not.toBe(frozen);
    sameAsLayout(expected());
  });

  it('can be unlocked, count changed, and rolled again', () => {
    m.Composition.lock('sphere');
    m.Composition.unlock('sphere');
    m.SceneConfig.update({ shapes: { sphere: { count: 5 } } });
    expect(meshesOf('sphere')).toHaveLength(5);
  });

  it('refuses to lock nothing, or something already locked', () => {
    m.SceneConfig.update({ shapes: { circle: { count: 0 } } });
    expect(m.Composition.lock('circle')).toBe(false);
    expect(m.SceneConfig.get().shapes.circle.locked).toBeNull();
    expect(m.Composition.lock('sphere')).toBe(true);
    expect(m.Composition.lock('sphere')).toBe(false);
    expect(m.Composition.lock('no-such-shape')).toBe(false);
  });

  it('a saved preset brings the lock back: the locked shapes exactly, the rest regenerated around them', () => {
    m.Composition.lock('sphere');
    const saved = m.SceneConfig.toJSON();
    const frozen = typeState('sphere');

    m.Composition.unlock('sphere');
    m.Composition.advance();
    settle();
    expect(typeState('sphere')).not.toBe(frozen);

    m.SceneConfig.replace(saved);
    settle();
    expect(typeState('sphere')).toBe(frozen);   // exact
    sameAsLayout(expected());                   // and the scene is generate(saved config)
    // (the OTHER shapes were resolved before the lock existed on screen; regenerating
    // places them around the locked ones, so they may differ slightly from that moment)
  });

  it('survives history: stepping back/forward through seeds leaves the locked shapes alone', () => {
    m.SceneHistory.start();
    m.Composition.advance();
    settle();                           // let it land BEFORE taking the baseline
    m.Composition.lock('sphere');
    const frozen = typeState('sphere');
    m.Composition.advance();
    m.Composition.advance();
    settle();
    expect(typeState('sphere')).toBe(frozen);
    expect(m.SceneHistory.back()).toBe(true);
    settle();
    expect(typeState('sphere')).toBe(frozen);
    sameAsLayout(expected());
    expect(m.SceneHistory.back()).toBe(true);
    settle();
    expect(typeState('sphere')).toBe(frozen);
    expect(m.SceneHistory.forward()).toBe(true);
    settle();
    expect(typeState('sphere')).toBe(frozen);
  });
});

describe('rods in the scene', () => {
  it('are drawn in the palette ink, and do not disturb the other shapes', () => {
    m.Composition.advance();
    settle();
    const others = JSON.stringify(sceneState().filter((e) => e.type !== 'rod'));
    m.SceneConfig.update({ shapes: { rod: { count: 4 } } });
    settle();
    expect(meshesOf('rod')).toHaveLength(4);
    const ink = new THREE.Color(m.Palette.active().ink).getHex();
    meshesOf('rod').forEach((r) => {
      expect(new THREE.Color('#' + r.userData.baseColor.getHexString()).getHex()).toBe(ink);
    });
    expect(JSON.stringify(sceneState().filter((e) => e.type !== 'rod'))).toBe(others);
  });

  it('follow a palette change to the new ink', () => {
    m.SceneConfig.update({ shapes: { rod: { count: 2 } } });
    const other = m.Palette.names().find((n) => n !== m.SceneConfig.get().palette);
    m.Composition.advance({ palette: other });
    settle();
    const ink = new THREE.Color(m.Palette.get(other).ink).getHex();
    meshesOf('rod').forEach((r) => {
      expect(new THREE.Color('#' + r.userData.baseColor.getHexString()).getHex()).toBe(ink);
    });
  });
});


describe('snapped rotation in the scene', () => {
  const STEP = Math.PI / 4;
  const multiple = (a) => Math.abs(a / STEP - Math.round(a / STEP)) < 1e-6;
  const eulerOf = (mesh) => new THREE.Euler().setFromQuaternion(mesh.quaternion);

  it('after an advance every non-camera-facing instance of a snapping type sits at 45-degree angles', () => {
    m.SceneConfig.update({ shapes: { 'cube-fixed': { count: 6, snapRotation: true }, plane: { count: 4, snapRotation: true } } });
    for (let i = 0; i < 6; i++) {
      m.Composition.advance();
      settle();
      [...meshesOf('cube-fixed'), ...meshesOf('plane')].forEach((mesh) => {
        // the mesh orientation is the quaternion of the layout's snapped Euler angles
        const layoutEntry = expected().find((e) => e.type === mesh.userData.shapeType && meshesOf(mesh.userData.shapeType).indexOf(mesh) === e.index);
        layoutEntry.rotation.forEach((a) => expect(multiple(a)).toBe(true));
        const want = new THREE.Quaternion().setFromEuler(new THREE.Euler(...layoutEntry.rotation));
        expect(Math.abs(mesh.quaternion.dot(want))).toBeCloseTo(1, 6);
      });
    }
  });

  it('is a setting: changing it does nothing until the next advance, like size and spread', () => {
    m.SceneConfig.update({ shapes: { 'cube-fixed': { count: 3 } } });
    m.Composition.advance();
    settle();
    const before = JSON.stringify(meshesOf('cube-fixed').map((x) => x.quaternion.toArray()));
    m.SceneConfig.update({ shapes: { 'cube-fixed': { snapRotation: true } } });
    settle();
    expect(JSON.stringify(meshesOf('cube-fixed').map((x) => x.quaternion.toArray()))).toBe(before);
    m.Composition.advance();
    settle();
    sameAsLayout(expected());
    meshesOf('cube-fixed').forEach((x) => {
      const e = eulerOf(x);
      const want = new THREE.Quaternion().setFromEuler(new THREE.Euler(
        Math.round(e.x / STEP) * STEP, Math.round(e.y / STEP) * STEP, Math.round(e.z / STEP) * STEP));
      expect(Math.abs(x.quaternion.dot(want))).toBeCloseTo(1, 5); // already on a 45-degree orientation
    });
  });

  it('a locked type keeps its frozen rotations when the option is switched', () => {
    m.SceneConfig.update({ shapes: { 'cube-fixed': { count: 3 } } });
    m.Composition.advance();
    settle();
    m.Composition.lock('cube-fixed');
    const frozen = meshesOf('cube-fixed').map((x) => x.quaternion.clone());
    m.SceneConfig.update({ shapes: { 'cube-fixed': { snapRotation: true } } });
    m.Composition.advance();
    settle();
    // q and -q are the same orientation, so compare with |dot| = 1
    meshesOf('cube-fixed').forEach((x, i) => {
      expect(Math.abs(x.quaternion.dot(frozen[i]))).toBeCloseTo(1, 9);
    });
  });
});
