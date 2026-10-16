import * as THREE from 'three';
import { Palette } from '../palette/Palette.js';
import { SceneConfig } from '../config/store.js';
import { randomSeed } from '../generator/rng.js';
import { generateLayout } from '../generator/generate.js';
import { layoutCounts } from '../generator/layoutCounts.js';
import { Billboard } from './Billboard.js';
import { Tween } from './Tween.js';
import { Rhythm } from './Rhythm.js';
import { paintSeed } from '../texture/paintSeed.js';
import { paintMesh, disposeMesh } from '../texture/materials.js';
import { shapeRegistry, getShape } from '../shapes/registry.js';

// The scene view: keeps the live meshes in step with the SceneConfig.
// It owns no settings of its own — counts, visibility, duration and the
// palette are all read from the config, and it reacts to config changes:
//
//   count changed       -> add instances (placed at their generated
//                          position) / remove instances (disposed, any
//                          in-flight tween canceled)
//   visible changed     -> toggle mesh.visible
//   seed or palette     -> regenerate the layout and ease every mesh to it
//   replace() (preset)  -> likewise, even if the seed happens to match
//
// What the layout IS comes from generator/generate.js — a pure function of
// (config, palette, shapes, camera). Hidden shapes keep evolving
// underneath, so they're mid-composition whenever shown again.
//
// Requires Billboard.computeFromCamera() to have run before init()
// (SceneManager.init does this).

let instances = {}; // type -> THREE.Mesh[]
let sceneRef = null;
let unsubscribe = null;

function layoutFor(config) {
  return generateLayout({
    config,
    palette: Palette.get(config.palette),
    shapeDefs: shapeRegistry,
    view: { depthAxis: Billboard.direction(), billboard: Billboard.get() }
  });
}

// LayoutEntry -> the shape Tween.add() takes
function toTarget(entry) {
  return {
    position: new THREE.Vector3(...entry.position),
    rotation: { x: entry.rotation[0], y: entry.rotation[1], z: entry.rotation[2] },
    scale: new THREE.Vector3(...entry.scale),
    hex: entry.hex
  };
}

function place(mesh, entry, shape) {
  const t = toTarget(entry);
  mesh.position.copy(t.position);
  if (shape.facesCamera) {
    mesh.quaternion.copy(Billboard.get());
  } else {
    mesh.quaternion.setFromEuler(new THREE.Euler(t.rotation.x, t.rotation.y, t.rotation.z));
  }
  mesh.scale.copy(t.scale);
  paintMesh(mesh, new THREE.Color(t.hex));
}

function createInstance(shape, entry, visible) {
  const mesh = shape.create(entry.hex);
  // the paint of this slot (see texture/paintSeed.js)
  if (mesh.userData.front) mesh.userData.front.uSeed.value.set(...paintSeed(entry.type, entry.index));
  place(mesh, entry, shape);
  mesh.visible = visible;
  sceneRef.add(mesh);
  return mesh;
}

function removeInstance(mesh) {
  Tween.removeForMesh(mesh);
  sceneRef.remove(mesh);
  disposeMesh(mesh);
}

function onConfigChange(next, prev, meta) {
  let entries = null;
  let layout = null;
  const list = () => entries || (entries = layoutFor(next));
  const byKey = () => {
    if (!layout) {
      layout = new Map();
      list().forEach((e) => layout.set(`${e.type}:${e.index}`, e));
    }
    return layout;
  };
  const fresh = new Set();

  // Under the legacy generator a type holds exactly its configured `count`
  // instances. Under a composition strategy the strategy owns the counts
  // (config count only says "may be used"), so the pools follow the layout.
  const strategyOn = next.composition.strategy !== 'legacy';
  const strategyChanged = next.composition.strategy !== prev.composition.strategy;
  const wanted = strategyOn ? layoutCounts(list()) : null;
  const inclusionChanged = shapeRegistry.some((shape) => {
    const a = next.shapes[shape.type], b = prev.shapes[shape.type];
    return (a.count > 0) !== (b.count > 0) || !!a.locked !== !!b.locked;
  });

  shapeRegistry.forEach((shape) => {
    const arr = instances[shape.type];
    const s = next.shapes[shape.type];
    const want = wanted ? (wanted.get(shape.type) || 0) : s.count;

    while (arr.length > want) removeInstance(arr.pop());
    while (arr.length < want) {
      // new instances appear at their own generated position immediately
      // (not eased in); the next advance re-resolves everything together
      const mesh = createInstance(shape, byKey().get(`${shape.type}:${arr.length}`), s.visible);
      fresh.add(mesh);
      arr.push(mesh);
    }

    if (s.visible !== prev.shapes[shape.type].visible) {
      arr.forEach((mesh) => { mesh.visible = s.visible; });
    }
  });

  if (
    meta.replaced || next.seed !== prev.seed || next.palette !== prev.palette || strategyChanged
    // a strategy composes the whole frame: the frame's shape (orientation) and which
    // types take part are inputs to it, so changing them recomposes the scene
    || (strategyOn && (next.orientation !== prev.orientation || inclusionChanged))
  ) {
    // the composition change is an event: tell the shared clock, so every
    // visual system reads the same rhythm (see core/Rhythm.js)
    Rhythm.trigger(next.time.durationMs, next.time.autoAdvance ? next.time.intervalMs : 0);
    byKey().forEach((entry, key) => {
      const mesh = instances[entry.type][entry.index];
      if (mesh && !fresh.has(mesh)) Tween.add(mesh, toTarget(entry), next.time.durationMs);
    });
  }
}

/**
 * What a mesh looks like — or, mid-transition, where it's headed — as a
 * LockedEntry (see types.js): exactly what a lock freezes.
 */
function snapshot(mesh) {
  const target = Tween.targetOf(mesh);
  const position = target ? target.position : mesh.position;
  const quaternion = target ? target.quaternion : mesh.quaternion;
  const scale = target ? target.scale : mesh.scale;
  const color = target ? target.color : mesh.userData.baseColor;
  const euler = new THREE.Euler().setFromQuaternion(quaternion); // XYZ, same as the generator
  return {
    position: position.toArray(),
    rotation: [euler.x, euler.y, euler.z],
    scale: scale.toArray(),
    hex: '#' + color.getHexString()
  };
}

export const Composition = {
  init(scene) {
    sceneRef = scene;
    instances = {};
    shapeRegistry.forEach((shape) => { instances[shape.type] = []; });

    const config = SceneConfig.get();
    layoutFor(config).forEach((entry) => {
      const shape = getShape(entry.type);
      instances[entry.type][entry.index] = createInstance(shape, entry, config.shapes[entry.type].visible);
    });

    if (unsubscribe) unsubscribe();
    unsubscribe = SceneConfig.subscribe(onConfigChange);
  },

  /**
   * Freezes every instance of `type` exactly as it is on screen (or about
   * to be, mid-transition): from now on advances re-roll everything else
   * while this type stays put, and everything else is placed around it.
   * Nothing moves when you lock. The frozen instances live in the config
   * (shapes[type].locked), so presets, links, history and a reload all
   * keep them. Returns false if there was nothing to lock.
   */
  lock(type) {
    const arr = instances[type];
    if (!arr || arr.length === 0 || SceneConfig.get().shapes[type].locked) return false;
    return SceneConfig.update({ shapes: { [type]: { locked: arr.map(snapshot) } } });
  },

  /** Releases a lock: the type is generated from the seed again at the next advance. */
  unlock(type) {
    return SceneConfig.update({ shapes: { [type]: { locked: null } } });
  },

  /**
   * The single entry point every trigger (click / key / timer / button)
   * calls: pick a new seed, which re-randomizes every instance together.
   * `patch` lets a caller change something else in the same step (e.g. the
   * palette) so it's one transition, not two.
   */
  advance(patch = {}) {
    SceneConfig.update({ ...patch, seed: randomSeed() });
  }
};
