import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { SceneConfig } from '../src/config/store.js';
import { AutoAdvance } from '../src/core/AutoAdvance.js';
import { frameDt } from '../src/core/frameClock.js';
import { Tween } from '../src/core/Tween.js';
import { Rhythm } from '../src/core/Rhythm.js';
import { MAX_FRAME_MS, STALL_MS } from '../src/config/defaults.js';
import { playTransition, plainMesh, target, runFrames, steady, stepFrame, frameHooks } from './helpers/frameClock.js';

// Stage 6.0/6.1: the animation clock, pinned with an injected clock. Until 6.0 the
// frame loop clamped every frame to 100 ms (animation time fell behind real time on
// a slow machine) and auto-advance was a wall-clock setInterval. Since 6.1 one clock
// (core/frameClock.js) advances Tween, Rhythm and the auto-advance hold together.

// AutoAdvance calls Composition.advance(); the real one needs a scene, so it is replaced by whatever `advanceHook.fn` is.
const advanceHook = vi.hoisted(() => ({ fn: () => {} }));
vi.mock('../src/core/Composition.js', () => ({ Composition: { advance: () => advanceHook.fn() } }));

const MINUTE = 60_000;

describe('a 1-minute transition does not depend on the frame rate', () => {
  beforeEach(() => Rhythm.reset());
  const runs = {};
  for (const fps of [30, 60, 144]) {
    runs[fps] = playTransition({ frameMs: steady(fps), durationMs: MINUTE, to: 10, turn: 1.2 });
  }

  for (const fps of [30, 60, 144]) {
    it(`${fps} fps: lands exactly on the target, within one frame of 60 s`, () => {
      const r = runs[fps];
      expect(r.mesh.position.x).toBe(10);
      expect(r.mesh.rotation.z).toBeCloseTo(1.2, 9);
      expect(r.finishedAt).not.toBeNull();
      expect(Math.abs(r.finishedAt.wallMs - MINUTE)).toBeLessThanOrEqual(1000 / fps + 1e-6);
      // steady frames under the clamp: animation time equals wall time
      expect(r.finishedAt.animMs).toBeCloseTo(r.finishedAt.wallMs, 6);
    });
  }

  it('the path is the same at every frame rate (positions at fixed wall times, within one frame of motion)', () => {
    // fastest speed of the easing is 3 x distance / duration: one 30 fps frame moves at most 10 * 3 * 33.3 / 60000
    const tol = (10 * 3 * (1000 / 30)) / MINUTE + 1e-9;
    const base = runs[60].samples;
    expect(base.length).toBeGreaterThanOrEqual(11);
    for (const fps of [30, 144]) {
      runs[fps].samples.forEach((s, i) => {
        expect(Math.abs(s.x - base[i].x), `${fps} fps, t=${s.wallMs}`).toBeLessThanOrEqual(tol);
        expect(Math.abs(s.z - base[i].z), `${fps} fps, t=${s.wallMs}`).toBeLessThanOrEqual(tol * 0.12 + 1e-9);
      });
    }
  });

  it('the motion is monotonic: no step backwards and no step larger than the easing allows', () => {
    const prev = { x: 0 };
    const mesh = plainMesh();
    Rhythm.reset();
    Tween.add(mesh, target(10), MINUTE);
    const maxStep = (10 * 3 * (1000 / 30)) / MINUTE + 1e-9;
    runFrames({
      frameMs: steady(30),
      done: () => Tween.targetOf(mesh) === null,
      onFrame: () => {
        const d = mesh.position.x - prev.x;
        expect(d).toBeGreaterThanOrEqual(-1e-12);
        expect(d).toBeLessThanOrEqual(maxStep);
        prev.x = mesh.position.x;
      }
    });
    expect(mesh.position.x).toBe(10);
  });

  it('Rhythm follows the same transition: phase 0 -> 1 over the window, energy back to exactly 0 at rest', () => {
    for (const fps of [30, 60, 144]) {
      const r = runs[fps];
      const mid = r.samples.find((s) => s.wallMs === 30_000);
      expect(mid.phase, `${fps} fps`).toBeCloseTo(0.5, 1);
      expect(Rhythm.active).toBe(false);
    }
    expect(Rhythm.energy).toBe(0);
    expect(Rhythm.phase).toBe(1);
  });
});

describe('the animation clock (6.1): real time on a slow machine, a pause for a suspension', () => {
  beforeEach(() => Rhythm.reset());

  it('frameDt: frames count in full up to the stall limit, a longer one is a suspension worth MAX_FRAME_MS, junk is nothing', () => {
    expect(frameDt(16.7)).toBe(16.7);
    expect(frameDt(250)).toBe(250);
    expect(frameDt(STALL_MS - 1)).toBe(STALL_MS - 1);
    expect(frameDt(STALL_MS)).toBe(MAX_FRAME_MS);
    expect(frameDt(5 * 60_000)).toBe(MAX_FRAME_MS);
    for (const bad of [0, -5, NaN, Infinity]) expect(frameDt(bad)).toBe(0);
  });

  it('a machine that holds only 4 fps keeps real time: a 1-minute transition lasts a minute (6.0: 150 s)', () => {
    const r = playTransition({ frameMs: steady(4), durationMs: MINUTE, sampleEveryMs: 10_000, maxWallMs: 10 * MINUTE });
    expect(Math.abs(r.finishedAt.wallMs - MINUTE)).toBeLessThanOrEqual(250 + 1e-6);
    expect(r.mesh.position.x).toBe(10);
  });

  it('a hitch every second (one 400 ms frame among 60 fps frames) does not stretch it either (6.0: about 1.3 minutes)', () => {
    const frameMs = (frame) => (frame % 60 === 59 ? 400 : 1000 / 60);
    const r = playTransition({ frameMs, durationMs: MINUTE, maxWallMs: 10 * MINUTE });
    expect(Math.abs(r.finishedAt.wallMs - MINUTE)).toBeLessThanOrEqual(400 + 1e-6);
  });

  it('a suspension (a hidden tab for 10 minutes) pauses the transition and resumes it exactly where it stopped', () => {
    Rhythm.reset();
    const m = plainMesh();
    Tween.add(m, target(10), MINUTE);
    Rhythm.trigger(MINUTE, 0);
    runFrames({ frameMs: steady(60), maxWallMs: 30_000 });
    const before = m.position.x;
    expect(before).toBeCloseTo(5, 1);                    // half way
    const dt = stepFrame(10 * MINUTE);                   // the first frame after the absence
    expect(dt).toBe(MAX_FRAME_MS);
    // it did not jump: it moved by MAX_FRAME_MS of motion (the easing's top speed is 3 x 10 / 60 s) and no more
    expect(m.position.x - before).toBeLessThanOrEqual((10 * 3 * MAX_FRAME_MS) / MINUTE + 1e-9);
    expect(Rhythm.phase).toBeLessThan(0.51);
    // the rest takes the rest of the minute: 30 s minus the 100 ms the stall frame counted
    const rest = runFrames({ frameMs: steady(60), done: () => Tween.targetOf(m) === null });
    expect(Math.abs(rest.animMs - (30_000 - MAX_FRAME_MS))).toBeLessThanOrEqual(1000 / 60 + 1e-6);
    expect(m.position.x).toBe(10);
  });
});

describe('auto-advance runs on the animation clock (6.1): no timer, no queue', () => {
  let advance;

  beforeEach(() => {
    vi.useFakeTimers();
    Rhythm.reset();
    frameHooks.length = 0;
    advance = vi.fn(() => {
      // what Composition.advance does to the clock: a change starts
      const t = SceneConfig.get().time;
      Rhythm.trigger(t.durationMs, t.durationMs + t.holdMs);
    });
    advanceHook.fn = advance;
    SceneConfig.update({ time: { durationMs: 1100, holdMs: 2900, autoAdvance: true } });
    AutoAdvance.reset();
    frameHooks.push((dt) => AutoAdvance.update(dt));
  });
  afterEach(() => {
    vi.useRealTimers();
    frameHooks.length = 0;
    SceneConfig.update({ time: { durationMs: 1100, holdMs: 2900, autoAdvance: false } });
  });

  const play = (ms, fps = 60) => runFrames({ frameMs: steady(fps), maxWallMs: ms });

  it('Dev timing (1.1 s + 2.9 s): a change every 4 s of animation', () => {
    play(60_000);
    expect(advance.mock.calls.length).toBeGreaterThanOrEqual(14);
    expect(advance.mock.calls.length).toBeLessThanOrEqual(15);
  });

  it('starts no timer at all, and wall time without frames starts nothing (a hidden tab no longer queues advances)', () => {
    expect(vi.getTimerCount()).toBe(0);
    vi.advanceTimersByTime(10 * 60_000);
    expect(advance).not.toHaveBeenCalled();
  });

  it('a suspension counts as MAX_FRAME_MS: it neither fires an advance nor loses the hold already counted', () => {
    play(3000);
    const at = AutoAdvance.elapsed();
    expect(at).toBeGreaterThan(2900);
    stepFrame(30 * 60_000);
    expect(advance).not.toHaveBeenCalled();
    expect(AutoAdvance.elapsed() - at).toBeCloseTo(MAX_FRAME_MS, 6);
  });

  it('never catches up: one enormous update starts one change, not a queue of them', () => {
    expect(AutoAdvance.update(10 * 3600_000)).toBe(true);
    expect(advance).toHaveBeenCalledTimes(1);
    expect(AutoAdvance.update(1)).toBe(false);
  });

  it('Exhibition timing (60 s + 15 min): nothing for 15 minutes 59 s, the change at 16 minutes', () => {
    SceneConfig.update({ time: { durationMs: 60_000, holdMs: 900_000 } });
    AutoAdvance.reset();
    play(16 * 60_000 - 1000, 20);
    expect(advance).not.toHaveBeenCalled();
    play(1500, 20);
    expect(advance).toHaveBeenCalledTimes(1);
  });

  it('a change that starts some other way (a click) restarts the cycle: the next one comes a full cycle later', () => {
    play(3000);
    Rhythm.trigger(1100, 4000);                 // the user clicks Advance at 3 s
    play(3500);                                 // 6.5 s: the old 4 s mark has passed
    expect(advance).not.toHaveBeenCalled();
    play(1000);                                 // 7.5 s: a cycle after the click
    expect(advance).toHaveBeenCalledTimes(1);
  });

  it('the lab pause stands the cycle still with the event clock', () => {
    Rhythm.setHold(0.5, 1100);
    play(20_000);
    expect(advance).not.toHaveBeenCalled();
    Rhythm.setHold(null, 1100);
  });

  it('turning Auto off stops the changes, and turning it on again starts a fresh cycle (not what was left of the old one)', () => {
    play(3000);                                  // 3 s into a 4 s cycle
    SceneConfig.update({ time: { autoAdvance: false } });
    play(30_000);
    expect(advance).not.toHaveBeenCalled();
    SceneConfig.update({ time: { autoAdvance: true } });
    play(2000);
    expect(advance).not.toHaveBeenCalled();      // the 1 s that was left would have fired by now
    play(2500);
    expect(advance).toHaveBeenCalledTimes(1);
  });

  it('the period is the transition plus the hold (hold 0: back to back; a longer hold, a longer rest)', () => {
    SceneConfig.update({ time: { durationMs: 1000, holdMs: 0 } });
    AutoAdvance.reset();
    play(10_000);
    expect(advance.mock.calls.length).toBeGreaterThanOrEqual(9);
    advance.mockClear();
    SceneConfig.update({ time: { durationMs: 1000, holdMs: 9000 } });
    AutoAdvance.reset();
    play(25_000);
    expect(advance.mock.calls.length).toBeGreaterThanOrEqual(2);
    expect(advance.mock.calls.length).toBeLessThanOrEqual(3);
  });
});
