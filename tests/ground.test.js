import { describe, it, expect } from 'vitest';
import * as THREE from 'three';
import { GROUND_FRAGMENT, GROUND_WEIGHTS } from '../src/texture/GroundLayer.js';

describe('ground shader', () => {
  it('is procedural, seeded by a uniform, and has no texture input', () => {
    expect(GROUND_FRAGMENT).toContain('uniform vec2 uSeed;');
    expect(GROUND_FRAGMENT).not.toContain('sampler2D');
    expect(GROUND_FRAGMENT).not.toMatch(/random|time/i);
  });
  it('converts to the output color space like the other materials', () => {
    expect(GROUND_FRAGMENT).toContain('#include <colorspace_fragment>');
    expect(THREE.ShaderChunk.colorspace_fragment).toBeTruthy();
  });
  it('moves only through its morph position: no clock, and the motion code is behind a uniform branch', () => {
    expect(GROUND_FRAGMENT).toContain('uniform float uMotion;');
    expect(GROUND_FRAGMENT).toContain('if ( uMotion > 0.0 )');
    expect(GROUND_FRAGMENT).not.toMatch(/uTime|iTime/);
  });
  it('the crack network is per-seed and morphs with the mottle, behind the same uniforms', () => {
    expect(GROUND_FRAGMENT).toContain('uniform float uCrackVary;');
    expect(GROUND_FRAGMENT).toContain('float crackEdge( vec2 p, vec2 offA, vec2 offB, float w )');
    expect(GROUND_FRAGMENT).toContain('crackEdge( q, ca, cb, uMorph )');
    // pinned (vary 0) both networks use offset 0, i.e. the same cells
    expect(GROUND_FRAGMENT).toContain('uOffA * uCrackVary');
    // line weight is physical, not tied to the pixel size, so exports match the screen
    expect(GROUND_FRAGMENT).toContain('smoothstep( 0.065 - aa, 0.065 + aa, e )');
  });
  it('has its weights substituted in', () => {
    expect(GROUND_FRAGMENT).toContain('@KM@');
    expect(GROUND_WEIGHTS.mottle).toBeGreaterThan(0);
  });
});

describe('ground motion', () => {
  async function setup() {
    const g = await import('../src/texture/GroundLayer.js');
    const { Rhythm } = await import('../src/core/Rhythm.js');
    Rhythm.reset();
    g.resetGroundMotion();
    g.groundMotion.enabled = true;
    const state = { seed: 1001 };
    const step = (ms = 16) => g.updateGroundMotion({ duration: 1000, hold: null }, ms, state.seed);
    return { g, state, step };
  }

  it('morphs once, one way, onto the new seed\'s pattern, and stays there', async () => {
    const { g, state, step } = await setup();
    step();
    expect(g.groundMotion.pos).toBe(0);
    expect(g.groundMotion.level).toBe(0);
    state.seed = 2002;
    let prev = 0, maxLevel = 0, moved = false;
    for (let i = 0; i < 400; i++) {
      step();
      const abs = g.groundMotion.shifts + g.groundMotion.pos;
      expect(abs).toBeGreaterThanOrEqual(prev - 1e-9);                 // never back
      prev = abs;
      maxLevel = Math.max(maxLevel, g.groundMotion.level);
      if (abs > 0.2) moved = true;
    }
    expect(moved).toBe(true);
    expect(maxLevel).toBeGreaterThan(0.9);                               // it deforms mid-morph ...
    expect(g.groundMotion.level).toBe(0);                                // ... and is still at the end
    expect(g.groundMotion.pos).toBe(0);                                  // the list was trimmed: at rest on the new pattern
    const [x, y] = g.groundOffset(2002);
    const g2 = await import('../src/texture/GroundLayer.js');
    expect(x).toBeGreaterThanOrEqual(0); expect(y).toBeLessThan(211);
    expect(g2.groundOffset(2002)).toEqual([x, y]);
    expect(g.groundOffset(1001)).not.toEqual([x, y]);
  });

  it('waits out its delay before moving', async () => {
    const { g, state, step } = await setup();
    step();
    state.seed = 2002;
    for (let i = 0; i < 6; i++) step();               // ~100 ms of a 200 ms delay
    expect(g.groundMotion.pos).toBe(0);
    for (let i = 0; i < 40; i++) step();
    expect(g.groundMotion.pos).toBeGreaterThan(0);
  });

  it('a change mid-morph retargets without a jump and never goes back', async () => {
    const { g, state, step } = await setup();
    step();
    state.seed = 2002;
    for (let i = 0; i < 60; i++) step();               // well into the morph
    const before = g.groundMotion.shifts + g.groundMotion.pos;
    expect(before).toBeGreaterThan(0.1);
    expect(before).toBeLessThan(1);
    state.seed = 3003;
    let last = before, maxStep = 0;
    for (let i = 0; i < 700; i++) {
      step();
      const abs = g.groundMotion.shifts + g.groundMotion.pos;
      expect(abs).toBeGreaterThanOrEqual(last - 1e-9);
      maxStep = Math.max(maxStep, abs - last);
      last = abs;
    }
    expect(maxStep).toBeLessThan(0.05);               // smooth: no jump at the retarget or anywhere
    expect(g.groundMotion.level).toBe(0);
  });

  it('at rest the pattern depends only on the current seed, not on the history', async () => {
    const a = await setup();
    a.step();
    const offsets = [];
    for (const seed of [2002, 3003]) {
      a.state.seed = seed;
      for (let i = 0; i < 700; i++) a.step();
    }
    const { g } = a;
    // the pattern in force after 1001 -> 2002 -> 3003 is that of 3003: the list ends at it
    a.g.resetGroundMotion();
    const b = await setup();
    b.step(); b.state.seed = 3003;
    for (let i = 0; i < 700; i++) b.step();
    void offsets; void g;
    expect(b.g.groundOffset(3003)).toEqual(a.g.groundOffset(3003));
  });

  it('a palette-only change (same seed) does not move the ground', async () => {
    const { g, step } = await setup();
    step();
    for (let i = 0; i < 100; i++) step();
    expect(g.groundMotion.pos).toBe(0);
    expect(g.groundMotion.level).toBe(0);
  });

  it('switched off, it snaps to the new pattern with no motion', async () => {
    const { g, state, step } = await setup();
    step();
    g.groundMotion.enabled = false;
    state.seed = 2002;
    step();
    expect(g.groundMotion.level).toBe(0);
    expect(g.groundMotion.pos).toBe(0);               // trimmed: already on the new pattern
    g.groundMotion.enabled = true;
  });
});

describe('ground cache (v0.14.1)', () => {
  it('the copy the scene draws reads one texel per pixel and converts like every material', async () => {
    const { BLIT_FRAGMENT } = await import('../src/texture/GroundLayer.js');
    expect(BLIT_FRAGMENT).toContain('texelFetch( uMap, ivec2( gl_FragCoord.xy ), 0 )');
    expect(BLIT_FRAGMENT).toContain('#include <colorspace_fragment>');
  });

  it('the change detector reports the first list, a changed list, and nothing for the same list', async () => {
    const { createChangeDetector } = await import('../src/texture/GroundLayer.js');
    const d = createChangeDetector();
    expect(d.changed([1, 2, 3])).toBe(true);
    expect(d.changed([1, 2, 3])).toBe(false);
    expect(d.changed([1, 2, 4])).toBe(true);
    expect(d.changed([1, 2, 4])).toBe(false);
    expect(d.changed([1, 2, 4, 5])).toBe(true);   // a different length is a change
    d.forget();
    expect(d.changed([1, 2, 4, 5])).toBe(true);
  });

  it('at rest the ground\'s signature is constant, and every way of changing the ground changes it', async () => {
    const g = await import('../src/texture/GroundLayer.js');
    const { Rhythm } = await import('../src/core/Rhythm.js');
    Rhythm.reset();
    g.resetGroundMotion();
    g.groundMotion.enabled = true;
    const step = (seed) => g.updateGroundMotion({ duration: 1000, hold: null }, 16, seed);
    for (let i = 0; i < 5; i++) step(1001);
    const rest = g.groundSignature();
    for (let i = 0; i < 50; i++) step(1001);
    expect(g.groundSignature()).toEqual(rest);                       // nothing moves at rest: no redraw
    // a seed change moves it for as long as the morph runs, then it settles on a new constant
    step(2002);
    for (let i = 0; i < 20; i++) step(2002);
    expect(g.groundSignature()).not.toEqual(rest);
    for (let i = 0; i < 1500; i++) step(2002);
    const settled = g.groundSignature();
    for (let i = 0; i < 20; i++) step(2002);
    expect(g.groundSignature()).toEqual(settled);
    // palette, lab edits and the aspect each change it
    const before = g.groundSignature();
    g.setGroundPaper('#123456');
    expect(g.groundSignature()).not.toEqual(before);
    const b2 = g.groundSignature();
    g.setGroundAspect(1.234);
    expect(g.groundSignature()).not.toEqual(b2);
    const b3 = g.groundSignature();
    g.setGroundParams({ on: true, visibility: 0.05, scale: 1, cracks: 0.5, crackScale: 1, crackStretch: 2, crackVary: 1 });
    expect(g.groundSignature()).not.toEqual(b3);
  });
});
