import * as THREE from 'three';
import { Palette } from '../palette/Palette.js';
import { SceneConfig } from '../config/store.js';
import { randomSeed } from '../generator/rng.js';
import { generateLayout } from '../generator/generate.js';
import { layoutCounts } from '../generator/layoutCounts.js';
import { matchInstances } from './matching.js';
import { diagnoseLayout } from '../generator/diagnostics.js';
import { Billboard } from './Billboard.js';
import { Tween } from './Tween.js';
import { scheduleFor } from './schedule.js';
import { Rhythm } from './Rhythm.js';
import { cycleMs } from '../config/defaults.js';
import { paintSeedFor, paintSlots } from '../texture/paintSeed.js';
import { paintMesh, disposeMesh, setShade } from '../texture/materials.js';
import { toneModeFor, faceShades } from '../texture/tone.js';
import { screenBasis } from '../generator/strategies/common.js';
import { attachShadow, setShadowNow, shadowFor } from '../texture/shadow.js';
import { setEdgeNow, edgeWanted } from '../texture/edge.js';
import { setHatchNow } from './../texture/hatch.js';
import { hasHighlight, highlightDirection, pickHighlights, setHighlightNow } from '../texture/highlight.js';
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
// Under a composition strategy the strategy owns the counts, so a new
// composition has a different number of shapes. Nothing pops: each shape on
// screen glides to the new shape of the same type that suits it best (same
// role first, then nearest: see matching.js), new shapes with no counterpart
// grow in from their own centre, and old ones with none shrink away and are
// disposed when they are gone. The legacy generator keeps one fixed set of
// shapes (the configured counts) and eases each to its slot, as before.
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
/** meshes shrinking away: out of `instances` already, still in the scene until their tween ends */
const leaving = new Set();
/** the scale a shape grows from / shrinks to (not 0: a zero scale is a degenerate matrix) */
const TINY = 0.001;

/** the entries of the current layouts that carry a selective highlight (texture/highlight.js), marked when a layout is generated */
const highlighted = new WeakSet();

function layoutFor(config) {
  const entries = generateLayout({
    config,
    palette: Palette.get(config.palette),
    shapeDefs: shapeRegistry,
    view: { depthAxis: Billboard.direction(), billboard: Billboard.get() }
  });
  pickHighlights(entries, { config, halfOf: (type) => getShape(type).localHalfExtents }).forEach((e) => highlighted.add(e));
  return entries;
}

/**
 * The per-face tone of a layout entry (the graphic tonal system, texture/tone.js): null under the legacy generator, which keeps its
 * fixed face tables, and for shapes that take no box tone. The mode belongs to the scene (its seed and strategy); the face roles
 * come from the entry's target orientation.
 */
function toneShade(entry, config) {
  const mode = toneModeFor(config.seed, config.composition.strategy);
  if (!mode) return null;
  const q = new THREE.Quaternion().setFromEuler(new THREE.Euler(...entry.rotation));
  return faceShades(entry.type, mode, q, screenBasis(Billboard.direction()), entry.hex);
}

/** The graphic shadow plane a layout entry wants (texture/shadow.js): null if its type carries none. */
function shadowOf(entry, config) {
  const shape = getShape(entry.type);
  return shadowFor(entry, {
    half: shape.localHalfExtents, config, palette: Palette.get(config.palette), view: screenBasis(Billboard.direction())
  });
}

/** What a layout entry wants of its selective highlight: null if its type carries none. */
function highlightOf(entry, config) {
  if (!hasHighlight(entry.type)) return null;
  return { on: highlighted.has(entry), dir: highlightDirection(screenBasis(Billboard.direction())), tint: new THREE.Color(Palette.get(config.palette).paper) };
}

// LayoutEntry -> the shape Tween.add() takes
function toTarget(entry, config) {
  return {
    shade: config ? toneShade(entry, config) : null,
    shadow: config ? shadowOf(entry, config) : null,
    highlight: config ? highlightOf(entry, config) : null,
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

/**
 * Points a mesh's paint at a slot, as the composition `config` has it. Nothing happens if it already is there and the seed is the
 * same, which is what a same-part glide hopes for; under "evolve" (paintSeed.js) a new composition seed is a new seed for the same
 * slot, and the old grain stays under the colour front like for any other change of paint.
 */
function setPaintSlot(mesh, type, slot, config = null) {
  const first = mesh.userData.paintSlot === undefined;
  mesh.userData.paintSlot = slot;
  const f = mesh.userData.front;
  if (!f) return;
  const seed = paintSeedFor(type, slot, config && edgeWanted(config) ? config.seed : null);
  if (!first && f.uSeed.value.x === seed[0] && f.uSeed.value.y === seed[1]) return;
  // another part's paint: the grain that was there stays under the colour front instead of jumping at once (Tween.add reads this flag)
  if (f.uSeedFrom && !first) { f.uSeedFrom.value.copy(f.uSeed.value); f.seedFromSet = true; }
  f.uSeed.value.set(...seed);
  if (f.uSeedFrom && first) f.uSeedFrom.value.copy(f.uSeed.value);
}

function createInstance(shape, entry, visible, slot = entry.index, config = null) {
  const mesh = shape.create(entry.hex);
  const shade = config ? toneShade(entry, config) : null;
  if (shade) setShade(mesh, shade);
  const shadow = config ? shadowOf(entry, config) : null;
  if (shadow) { attachShadow(mesh); setShadowNow(mesh, shadow); }
  // the paint of this slot (see texture/paintSeed.js)
  setPaintSlot(mesh, entry.type, slot, config);
  place(mesh, entry, shape);
  if (config) { setHighlightNow(mesh, highlightOf(entry, config)); setEdgeNow(mesh, config); setHatchNow(mesh, entry, config); }
  mesh.visible = visible;
  sceneRef.add(mesh);
  return mesh;
}

function removeInstance(mesh) {
  Tween.removeForMesh(mesh);
  sceneRef.remove(mesh);
  disposeMesh(mesh);
}

/** A shrinking shape that has finished: out of the scene and disposed. (Guarded: the lab's pause can replay a tween's end.) */
function disposeLeaving(mesh) {
  if (!leaving.has(mesh)) return;
  leaving.delete(mesh);
  removeInstance(mesh);
}

/**
 * A new change starts: the shapes still shrinking away from an earlier one leave with it. Without this they keep the earlier
 * change's own duration, so after a slow change (a minute) followed by a quicker one they stayed in the new composition for the
 * rest of the minute. Their picture does not jump (Tween.finishWithin keeps their progress); they only finish sooner.
 * @param {number} duration the new change's duration, ms
 */
function settleLeaving(duration) {
  leaving.forEach((mesh) => Tween.finishWithin(mesh, duration));
}

/**
 * Moves the scene to a new composition when a strategy is involved: glide what has a counterpart, grow in what is new, and
 * shrink away what is gone (see the header). `entries` is the new layout.
 */
function recompose(next, entries) {
  const olds = [];
  shapeRegistry.forEach((shape) => instances[shape.type].forEach((mesh) => {
    const target = Tween.targetOf(mesh); // where it is headed, if it is mid-transition
    olds.push({ mesh, type: shape.type, role: mesh.userData.role, position: (target ? target.position : mesh.position).toArray() });
  }));
  const { pairs, leaving: out, arriving } = matchInstances(olds, entries);
  const duration = next.time.durationMs;
  const slots = paintSlots(entries);

  /** @type {Record<string, THREE.Mesh[]>} */
  const pools = {};
  shapeRegistry.forEach((shape) => { pools[shape.type] = []; });

  pairs.forEach(({ old: oi, next: ni }) => {
    const entry = entries[ni];
    const mesh = olds[oi].mesh;
    mesh.userData.role = entry.role;
    setPaintSlot(mesh, entry.type, slots[ni], next); // the same part keeps its paint; another part takes its own
    pools[entry.type][entry.index] = mesh;
    setEdgeNow(mesh, next);
    setHatchNow(mesh, entry, next);
    Tween.add(mesh, toTarget(entry, next), duration, undefined, scheduleFor({ seed: next.seed, type: entry.type, role: entry.role, index: entry.index }));
  });

  arriving.forEach((ni) => {
    const entry = entries[ni];
    const mesh = createInstance(getShape(entry.type), entry, next.shapes[entry.type].visible, slots[ni], next);
    mesh.userData.role = entry.role;
    mesh.scale.multiplyScalar(TINY);            // starts as a speck at its own place...
    setEdgeNow(mesh, next);
    setHatchNow(mesh, entry, next);
    Tween.add(mesh, toTarget(entry, next), duration, undefined, scheduleFor({ seed: next.seed, type: entry.type, role: entry.role, index: entry.index })); // ...and grows to full size with the others, each on its own schedule
    pools[entry.type][entry.index] = mesh;
  });

  out.forEach((oi) => {
    const mesh = olds[oi].mesh;
    const target = Tween.targetOf(mesh);
    const quaternion = target ? target.quaternion : mesh.quaternion;
    const euler = new THREE.Euler().setFromQuaternion(quaternion);
    leaving.add(mesh);
    Tween.add(mesh, {
      position: (target ? target.position : mesh.position).clone(),
      rotation: { x: euler.x, y: euler.y, z: euler.z },
      scale: (target ? target.scale : mesh.scale).clone().multiplyScalar(TINY),
      hex: '#' + (target ? target.color : mesh.userData.baseColor).getHexString()
    }, duration, () => disposeLeaving(mesh), scheduleFor({ seed: next.seed, type: olds[oi].type, role: olds[oi].role, index: oi }));
  });
  settleLeaving(duration);

  instances = pools;
  shapeRegistry.forEach((shape) => pools[shape.type].forEach((mesh) => { mesh.visible = next.shapes[shape.type].visible; }));
}

function onConfigChange(next, prev, meta) {
  const strategyOn = next.composition.strategy !== 'legacy';
  const strategyChanged = next.composition.strategy !== prev.composition.strategy;
  const inclusionChanged = shapeRegistry.some((shape) => {
    const a = next.shapes[shape.type], b = prev.shapes[shape.type];
    return (a.count > 0) !== (b.count > 0) || !!a.locked !== !!b.locked;
  });

  // A strategy composes the whole frame: the frame's shape (orientation) and which types take part are inputs to it, so
  // changing them recomposes the scene, like a new seed or palette. When a strategy is (or was just) involved the
  // number of shapes changes with the composition, so the scene is moved by matching shapes, not slot by slot.
  if (
    (strategyOn || strategyChanged)
    && (meta.replaced || next.seed !== prev.seed || next.palette !== prev.palette || strategyChanged
      || next.orientation !== prev.orientation || inclusionChanged)
  ) {
    // the composition change is an event: tell the shared clock (see core/Rhythm.js)
    Rhythm.trigger(next.time.durationMs, next.time.autoAdvance ? cycleMs(next.time) : 0);
    recompose(next, layoutFor(next));
    return;
  }

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
  let slots = null;
  /** the paint slot of one entry of the new layout (its index for a legacy entry) */
  const slotOf = (entry) => {
    if (!slots) {
      const all = paintSlots(list());
      slots = new Map(list().map((e, i) => [e, all[i]]));
    }
    return slots.get(entry);
  };

  // Under the legacy generator a type holds exactly its configured `count`
  // instances. Under a composition strategy the strategy owns the counts
  // (config count only says "may be used"), so the pools follow the layout.
  const wanted = strategyOn ? layoutCounts(list()) : null;

  shapeRegistry.forEach((shape) => {
    const arr = instances[shape.type];
    const s = next.shapes[shape.type];
    const want = wanted ? (wanted.get(shape.type) || 0) : s.count;

    while (arr.length > want) removeInstance(arr.pop());
    while (arr.length < want) {
      // new instances appear at their own generated position immediately
      // (not eased in); the next advance re-resolves everything together
      const entry = byKey().get(`${shape.type}:${arr.length}`);
      const mesh = createInstance(shape, entry, s.visible, slotOf(entry), next);
      fresh.add(mesh);
      arr.push(mesh);
    }

    if (s.visible !== prev.shapes[shape.type].visible) {
      arr.forEach((mesh) => { mesh.visible = s.visible; });
    }
  });

  if (meta.replaced || next.seed !== prev.seed || next.palette !== prev.palette) {
    // the composition change is an event: tell the shared clock, so every
    // visual system reads the same rhythm (see core/Rhythm.js)
    Rhythm.trigger(next.time.durationMs, next.time.autoAdvance ? cycleMs(next.time) : 0);
    settleLeaving(next.time.durationMs);
    byKey().forEach((entry, key) => {
      const mesh = instances[entry.type][entry.index];
      if (mesh && !fresh.has(mesh)) { setPaintSlot(mesh, entry.type, mesh.userData.paintSlot, next); setEdgeNow(mesh, next); setHatchNow(mesh, entry, next); Tween.add(mesh, toTarget(entry, next), next.time.durationMs, undefined, scheduleFor({ seed: next.seed, type: entry.type, role: entry.role, index: entry.index })); }
    });
  }
}

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
    leaving.forEach((mesh) => removeInstance(mesh)); // shapes of a previous scene still shrinking away
    leaving.clear();
    sceneRef = scene;
    instances = {};
    shapeRegistry.forEach((shape) => { instances[shape.type] = []; });

    const config = SceneConfig.get();
    const initial = layoutFor(config);
    const initialSlots = paintSlots(initial);
    initial.forEach((entry, i) => {
      const shape = getShape(entry.type);
      const mesh = createInstance(shape, entry, config.shapes[entry.type].visible, initialSlots[i], config);
      mesh.userData.role = entry.role;
      instances[entry.type][entry.index] = mesh;
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
   * What the current composition does (see generator/diagnostics.js): real 3D intersections, silhouette overlaps, and under a
   * strategy how far the depth solver moved shapes from the plan. Read-only; recomputes the (deterministic) layout.
   */
  diagnostics() {
    const config = SceneConfig.get();
    return diagnoseLayout({
      entries: layoutFor(config), shapeDefs: shapeRegistry,
      view: { depthAxis: Billboard.direction(), billboard: Billboard.get() }
    });
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
