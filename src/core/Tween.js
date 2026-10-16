import * as THREE from 'three';
import { Billboard } from './Billboard.js';
import { paintMesh } from '../texture/materials.js';
import { Rhythm } from './Rhythm.js';

// Eases position/scale (lerp), rotation (quaternion slerp — shortest
// path), and color (see below; classic RGB lerp of the base color, repainted each frame via
// paintMesh() — Tween knows nothing about how a shape is shaded; see the
// shading contract in texture/materials.js). No external dependency.

const active = [];
// The last tween of each mesh, kept after it finishes so the lab's pause can
// scrub the last change back and forth (0 = before, 1 = after) even when
// nothing is animating any more. Cleared per mesh by removeForMesh/add.
/** @type {Map<THREE.Mesh, any>} */
const finished = new Map();
/** finished tweens the pause has moved off their end state */
/** @type {Set<any>} */
const scrubbed = new Set();
const scratchColor = new THREE.Color(); // reused every frame — no per-frame allocation

// Color travels one of two ways. Classic: the base color is lerped in RGB
// every frame (what every shape did before). Front: the mesh is painted its
// NEW color at once and a per-mesh `front` number sweeps the old color away
// in the shader (see texture/PigmentResponse.js) — only for meshes that
// carry the front state (everything built by materialSetMesh; not the
// sphere, which keeps the classic lerp).
const colorFront = { enabled: true, delay: 0.1 };

/** Lab hook: choose how color travels, and how long after the geometry starts it begins. */
export function setColorFront(p) {
  colorFront.enabled = !!p.enabled;
  colorFront.delay = Math.min(0.9, Math.max(0, p.delay));
}

function easeInOutCubic(t) {
  return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
}

/**
 * Removes any active tween(s) targeting `mesh`. Used both when a new
 * tween starts on a mesh that's already mid-transition, and when an
 * instance is deleted entirely (see Composition) — without
 * this, a removed mesh's tween would keep running forever, updating a
 * mesh no longer in the scene and holding a reference that prevents
 * it from being garbage-collected.
 */
export function removeForMesh(mesh) {
  for (let i = active.length - 1; i >= 0; i--) {
    if (active[i].mesh === mesh) active.splice(i, 1);
  }
  finished.delete(mesh);
}

/**
 * Where `mesh` is headed: the end values of its running tween, or null if
 * it isn't animating. Locking a shape type freezes this (the destination),
 * not whatever half-way frame happens to be on screen.
 * @param {THREE.Mesh} mesh
 */
export function targetOf(mesh) {
  const t = active.find((a) => a.mesh === mesh);
  if (!t) return null;
  return {
    position: t.endPosition.clone(),
    quaternion: t.endQuaternion.clone(),
    scale: t.endScale.clone(),
    color: t.endColor.clone()
  };
}

/**
 * @param {THREE.Mesh} mesh
 * @param {{position: THREE.Vector3, rotation: {x:number,y:number,z:number}, scale: THREE.Vector3, hex: string}} target
 * @param {number} duration ms
 */
export function add(mesh, target, duration) {
  // if this mesh is already mid-transition, cancel that tween instead
  // of letting both run: two tweens on one mesh fight over its
  // position/rotation/scale/color every frame, and — since color's
  // "start" is read from a cache that's only updated on completion,
  // not every frame — re-triggering mid-flight used to make color
  // jump straight to a stale value instead of easing from wherever it
  // actually was
  removeForMesh(mesh);

  const start = {
    position: mesh.position.clone(),
    quaternion: mesh.quaternion.clone(),
    scale: mesh.scale.clone(),
    // paintMesh() keeps userData.baseColor live every frame, so this is the
    // color actually on screen right now even if we interrupt a tween
    baseColor: mesh.userData.baseColor.clone()
  };
  const targetColor = new THREE.Color(target.hex);
  const front = colorFront.enabled ? mesh.userData.front : null;
  if (front) {
    // What is on screen now becomes the layer under the new change.
    // Uninterrupted: just the colour that had landed. Interrupted mid-change:
    // the change in flight is kept frozen where it was (its patches stay
    // changed) and the new one covers it; an older layer still unfinished by
    // then is settled onto its target (the one case that can pop).
    const landed = mesh.userData.baseColor;
    if (front.uFront.value < 1) {
      front.uFrom.value.copy(front.uMid.value);
      front.uMid.value.copy(landed);
      front.uFrontA.value = front.uFront.value;
    } else {
      front.uFrom.value.copy(landed);
      front.uMid.value.copy(landed);
      front.uFrontA.value = 1;
    }
    front.uFront.value = 0;
    // the new colour is in place from the first frame; the shader reveals it
    paintMesh(mesh, targetColor);
  } else if (mesh.userData.front) {
    mesh.userData.front.uFront.value = 1;
  }
  const targetQuat = new THREE.Quaternion().setFromEuler(
    new THREE.Euler(target.rotation.x, target.rotation.y, target.rotation.z)
  );

  active.push({
    mesh, start,
    endPosition: target.position,
    endQuaternion: targetQuat,
    endScale: target.scale,
    endColor: targetColor,
    duration,
    elapsed: 0,
    front,
    delay: colorFront.delay
  });
}

/** Puts a tween's mesh where it is `t.elapsed` ms into the change. */
function applyTween(t) {
  const p = Math.min(Math.max(t.elapsed / t.duration, 0), 1);
  const e = easeInOutCubic(p);

  // on the final frame, land on the exact target values rather than a
  // lerp that may be 1 ulp off — so a finished scene is bit-for-bit the
  // layout it was generated from
  if (p >= 1) {
    t.mesh.position.copy(t.endPosition);
    t.mesh.scale.copy(t.endScale);
  } else {
    t.mesh.position.lerpVectors(t.start.position, t.endPosition, e);
    t.mesh.scale.lerpVectors(t.start.scale, t.endScale, e);
  }
  if (t.mesh.userData.facesCamera) {
    // always facing the fixed camera — rotation is never eased
    t.mesh.quaternion.copy(Billboard.get());
  } else if (p >= 1) {
    t.mesh.quaternion.copy(t.endQuaternion);
  } else {
    t.mesh.quaternion.slerpQuaternions(t.start.quaternion, t.endQuaternion, e);
  }

  if (t.front) {
    t.front.uFront.value = p >= 1 ? 1 : Math.min(1, Math.max(0, (e - t.delay) / (1 - t.delay)));
  } else {
    paintMesh(t.mesh, p >= 1 ? t.endColor : scratchColor.copy(t.start.baseColor).lerp(t.endColor, e));
  }
  return p;
}

export function update(dt) {
  if (Rhythm.hold !== null) {
    // The lab's pause: every change, running or just finished, is shown
    // `hold` durations in — geometry and color together. Nothing completes
    // or is dropped, so the slider can go back and forth.
    for (const t of active) {
      t.elapsed = Rhythm.hold * t.duration;
      applyTween(t);
    }
    for (const t of finished.values()) {
      t.elapsed = Rhythm.hold * t.duration;
      applyTween(t);
      scrubbed.add(t);
    }
    return;
  }

  if (scrubbed.size) {
    // released: a change the pause left part-way carries on from there
    for (const t of scrubbed) {
      if (t.elapsed < t.duration && finished.get(t.mesh) === t) {
        finished.delete(t.mesh);
        active.push(t);
      }
    }
    scrubbed.clear();
  }

  for (let i = active.length - 1; i >= 0; i--) {
    const t = active[i];
    t.elapsed += dt;
    const p = applyTween(t);
    if (p >= 1) {
      active.splice(i, 1);
      finished.set(t.mesh, t);
    }
  }
}

export const Tween = { add, update, removeForMesh, targetOf };
