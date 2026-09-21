import * as THREE from 'three';
import { Palette } from '../palette/Palette.js';
import { Billboard } from './Billboard.js';
import { Tween } from './Tween.js';
import { shapeRegistry, getShape } from '../shapes/registry.js';
import { computeAABB, resolveCollisions } from '../collision/CollisionResolver.js';

// Owns one instance of every registered shape at once, each with its
// own independent transform and color. `advance()` — the single entry
// point every trigger (click / key / timer / script) calls —
// re-randomizes ALL of them together, then resolves any genuine 3D
// collisions before easing anything. Checkboxes in the panel only
// toggle visibility; hidden shapes keep evolving underneath so
// they're mid-composition whenever shown again.

let instances = {};
let transitionDuration = 1100;

function bounds() {
  // keep shapes within a comfortable region of the frame — z is
  // wider than a purely cosmetic range since depth is an active axis
  // collision resolution can push shapes along
  return { x: 1.9, y: 1.4, z: 1.5 };
}

function randomTarget(shape) {
  const b = bounds();
  return {
    position: new THREE.Vector3(
      (Math.random() * 2 - 1) * b.x,
      (Math.random() * 2 - 1) * b.y,
      (Math.random() * 2 - 1) * b.z
    ),
    rotation: {
      // mostly grid-aligned, occasionally tilted — a nod to the mix
      // of orthogonal and diagonal forms in Prouns. Unused by any
      // shape with facesCamera: true.
      x: (Math.random() < 0.7 ? 0 : Math.random() * Math.PI),
      y: Math.random() * Math.PI * 2,
      z: (Math.random() < 0.7 ? 0 : (Math.random() - 0.5) * 0.6)
    },
    scale: shape.randomScale(),
    hex: Palette.randomAccent()
  };
}

function buildCandidate(shape) {
  const raw = randomTarget(shape);
  const quat = shape.facesCamera
    ? Billboard.get().clone()
    : new THREE.Quaternion().setFromEuler(new THREE.Euler(raw.rotation.x, raw.rotation.y, raw.rotation.z));
  return {
    type: shape.type,
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

function allCandidates() {
  const depthAxis = Billboard.direction();
  const candidates = shapeRegistry.map(buildCandidate);
  return resolveCollisions(candidates, depthAxis);
}

export const Composition = {
  init(scene) {
    instances = {};
    allCandidates().forEach((c) => {
      const shape = getShape(c.type);
      const mesh = shape.create(c.hex);
      applyImmediate(mesh, c, shape);
      scene.add(mesh);
      instances[c.type] = mesh;
    });
  },

  setDuration(ms) {
    transitionDuration = ms;
  },

  setVisible(type, visible) {
    if (instances[type]) instances[type].visible = visible;
  },

  advance() {
    allCandidates().forEach((c) => {
      const mesh = instances[c.type];
      if (mesh) Tween.add(mesh, c, transitionDuration);
    });
  },

  types() {
    return shapeRegistry.map((s) => s.type);
  }
};
