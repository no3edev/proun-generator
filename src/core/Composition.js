import * as THREE from 'three';
import { Palette } from '../palette/Palette.js';
import { Billboard } from './Billboard.js';
import { Tween } from './Tween.js';
import { shapeRegistry, getShape } from '../shapes/registry.js';
import { computeAABB, resolveCollisions } from '../collision/CollisionResolver.js';
import { ShapeSettings } from '../settings/ShapeSettings.js';

// Owns a variable number of instances per registered shape type (see
// ShapeSettings.count), each with its own independent transform and
// color — instances of the same type never share a random draw, so
// they never move in sync or land on the same color. `advance()` —
// the single entry point every trigger (click / key / timer / script)
// calls — re-randomizes every instance of every type together, then
// resolves any genuine 3D collisions (between different types AND
// between instances of the same type) before easing anything.
// Checkboxes in the panel only toggle visibility; hidden shapes keep
// evolving underneath so they're mid-composition whenever shown again.

let instances = {}; // type -> THREE.Mesh[]
let sceneRef = null;
let transitionDuration = 1100;

function bounds() {
  // the full-spread (spread = 1) region shapes are placed within; a
  // shape's own ShapeSettings.spread (0..2) scales this per-axis —
  // below 1 pulls toward the origin, above 1 extends past this edge
  // toward the origin. z is wider than a purely cosmetic range since
  // depth is an active axis collision resolution can push shapes along
  return { x: 1.9, y: 1.4, z: 1.5 };
}

function randomTarget(shape) {
  const b = bounds();
  const spread = ShapeSettings.get(shape.type).spread;
  const sizeMult = ShapeSettings.randomSizeMultiplier(shape.type);
  return {
    position: new THREE.Vector3(
      (Math.random() * 2 - 1) * b.x * spread,
      (Math.random() * 2 - 1) * b.y * spread,
      (Math.random() * 2 - 1) * b.z * spread
    ),
    rotation: {
      // mostly grid-aligned, occasionally tilted — a nod to the mix
      // of orthogonal and diagonal forms in Prouns. Unused by any
      // shape with facesCamera: true.
      x: (Math.random() < 0.7 ? 0 : Math.random() * Math.PI),
      y: Math.random() * Math.PI * 2,
      z: (Math.random() < 0.7 ? 0 : (Math.random() - 0.5) * 0.6)
    },
    scale: shape.randomScale().multiplyScalar(sizeMult),
    hex: Palette.randomAccent()
  };
}

// `instanceIndex` ties a candidate back to a specific mesh in
// instances[type][instanceIndex] — each call still draws its own
// independent random position/rotation/scale/color via randomTarget()
function buildCandidate(shape, instanceIndex) {
  const raw = randomTarget(shape);
  const quat = shape.facesCamera
    ? Billboard.get().clone()
    : new THREE.Quaternion().setFromEuler(new THREE.Euler(raw.rotation.x, raw.rotation.y, raw.rotation.z));
  return {
    type: shape.type,
    instanceIndex,
    position: raw.position,
    rotation: raw.rotation,
    scale: raw.scale,
    hex: raw.hex,
    box: computeAABB(shape.localHalfExtents, raw.position, quat, raw.scale)
  };
}

function applyImmediate(mesh, target, shape) {
  mesh.position.copy(target.position);
  if (shape.facesCamera) {
    mesh.quaternion.copy(Billboard.get());
  } else {
    mesh.quaternion.setFromEuler(new THREE.Euler(target.rotation.x, target.rotation.y, target.rotation.z));
  }
  mesh.scale.copy(target.scale);
  mesh.userData.baseColor = new THREE.Color(target.hex);
}

// one candidate per instance of every shape type, collision-resolved
// against every other candidate regardless of type — two cubes (or a
// cube and a sphere) are treated identically by CollisionResolver
function allCandidates() {
  const depthAxis = Billboard.direction();
  const candidates = [];
  shapeRegistry.forEach((shape) => {
    const count = ShapeSettings.get(shape.type).count;
    for (let i = 0; i < count; i++) {
      candidates.push(buildCandidate(shape, i));
    }
  });
  return resolveCollisions(candidates, depthAxis);
}

export const Composition = {
  init(scene) {
    sceneRef = scene;
    instances = {};
    shapeRegistry.forEach((shape) => { instances[shape.type] = []; });

    allCandidates().forEach((c) => {
      const shape = getShape(c.type);
      const mesh = shape.create(c.hex);
      applyImmediate(mesh, c, shape);
      scene.add(mesh);
      instances[c.type][c.instanceIndex] = mesh;
    });
  },

  setDuration(ms) {
    transitionDuration = ms;
  },

  getDuration() {
    return transitionDuration;
  },

  setVisible(type, visible) {
    (instances[type] || []).forEach((mesh) => { mesh.visible = visible; });
  },

  /**
   * Adds or removes instances of `type` to reach `count`. New
   * instances are placed with their own random target immediately
   * (not yet collision-resolved against the rest of the scene — the
   * next advance() fully re-resolves everything); removed instances
   * are taken out of the scene and have any in-flight tween canceled
   * so nothing keeps animating a mesh that's no longer there.
   */
  setCount(type, count) {
    const shape = getShape(type);
    if (!shape || !sceneRef) return;
    const arr = instances[type] || (instances[type] = []);
    const target = Math.max(0, Math.floor(count));

    while (arr.length > target) {
      const mesh = arr.pop();
      if (mesh) {
        Tween.removeForMesh(mesh);
        sceneRef.remove(mesh);
      }
    }
    while (arr.length < target) {
      const c = buildCandidate(shape, arr.length);
      const mesh = shape.create(c.hex);
      applyImmediate(mesh, c, shape);
      mesh.visible = ShapeSettings.get(type).visible;
      sceneRef.add(mesh);
      arr.push(mesh);
    }
  },

  advance() {
    allCandidates().forEach((c) => {
      const mesh = instances[c.type] && instances[c.type][c.instanceIndex];
      if (mesh) Tween.add(mesh, c, transitionDuration);
    });
  },

  types() {
    return shapeRegistry.map((s) => s.type);
  }
};
