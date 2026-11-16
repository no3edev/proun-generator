// Stage 6.0: an injected clock for the animation tests. It drives Tween and
// Rhythm the way SceneManager.loop does (each frame: dt = frameDt(raw),
// Tween.update(dt), Rhythm.update(dt), then whatever is in `frameHooks`, e.g.
// AutoAdvance.update) but from a fake frame source, so a 1-minute transition
// can be played in milliseconds at any frame rate, with hitches, and with the
// wall time and the animation time kept apart.
//
// The loop itself is not imported (SceneManager needs a renderer and a DOM) but
// the clock function it uses is the real one (core/frameClock.js, since 6.1).
// If the order of the loop's updates changes, change stepFrame() with it.
import * as THREE from 'three';
import { Tween } from '../../src/core/Tween.js';
import { Rhythm } from '../../src/core/Rhythm.js';
import { frameDt } from '../../src/core/frameClock.js';

/** A mesh with the minimum the classic (non-front) colour path needs. */
export function plainMesh(x = 0) {
  const m = new THREE.Mesh(new THREE.BoxGeometry(), new THREE.MeshBasicMaterial());
  m.position.set(x, 0, 0);
  m.userData.baseColor = new THREE.Color('#000000');
  m.userData.applyShade = () => {};
  return m;
}

/** A tween target at (x, 0, 0), rotated `rz` about z, white. */
export function target(x, rz = 0) {
  return { position: new THREE.Vector3(x, 0, 0), rotation: { x: 0, y: 0, z: rz }, scale: new THREE.Vector3(1, 1, 1), hex: '#ffffff' };
}

/**
 * One frame of the render loop, given the real time since the last frame.
 * @param {number} rawMs
 * @returns {number} the animation time that frame advanced (ms)
 */
export function stepFrame(rawMs) {
  const dt = frameDt(rawMs);
  Tween.update(dt);
  Rhythm.update(dt);
  for (const hook of frameHooks) hook(dt);
  return dt;
}

/** Called after Rhythm.update each frame with the animation dt (AutoAdvance.update, in the tests that need it). */
export const frameHooks = [];

/**
 * Plays frames until `done()` or `maxWallMs`.
 * @param {{ frameMs: (frame: number, wallMs: number) => number, done?: () => boolean,
 *           maxWallMs?: number, onFrame?: (s: { wallMs: number, animMs: number, frame: number }) => void }} o
 *   frameMs: the real time between frame `frame` and the one before it
 * @returns {{ wallMs: number, animMs: number, frames: number }}
 */
export function runFrames({ frameMs, done = () => false, maxWallMs = 1e9, onFrame }) {
  let wallMs = 0, animMs = 0, frame = 0;
  while (wallMs < maxWallMs && !done()) {
    const raw = frameMs(frame, wallMs);
    wallMs += raw;
    animMs += stepFrame(raw);
    frame++;
    if (onFrame) onFrame({ wallMs, animMs, frame });
  }
  return { wallMs, animMs, frames: frame };
}

/** A steady frame source at `fps`. */
export const steady = (fps) => () => 1000 / fps;

/**
 * Plays one change of a single mesh (0 -> `to` along x, turning by `turn`
 * radians) for `durationMs`, as Composition would start it (Tween.add plus
 * Rhythm.trigger), and samples the mesh every `sampleEveryMs` of wall time.
 */
export function playTransition({ frameMs, durationMs, to = 10, turn = 0, sampleEveryMs = 5000, maxWallMs = durationMs * 6 }) {
  Rhythm.reset();
  const mesh = plainMesh();
  let finishedAt = null;
  Tween.add(mesh, target(to, turn), durationMs, () => { /* completion is read from `finishedAt` below */ });
  Rhythm.trigger(durationMs, 0);
  const samples = [];
  let nextSample = sampleEveryMs;
  let tweenDone = false;
  const total = runFrames({
    frameMs,
    maxWallMs,
    done: () => tweenDone && !Rhythm.active,
    onFrame: ({ wallMs, animMs }) => {
      if (!tweenDone && mesh.position.x === to && mesh.rotation.z === mesh.rotation.z && Tween.targetOf(mesh) === null) {
        tweenDone = true;
        finishedAt = { wallMs, animMs };
      }
      while (wallMs >= nextSample) {
        samples.push({ wallMs: nextSample, x: mesh.position.x, z: mesh.rotation.z, phase: Rhythm.phase, energy: Rhythm.energy });
        nextSample += sampleEveryMs;
      }
    }
  });
  return { mesh, samples, finishedAt, total };
}
