import { describe, it, expect, beforeEach } from 'vitest';
import { Rhythm, envelope, envelopeTiming, smooth01, unsmooth01 } from '../src/core/Rhythm.js';

const D = 1100;

describe('envelope', () => {
  it('is 0 before the event, 1 at the end of the attack, 0 after the release', () => {
    const { attack, release } = envelopeTiming(D, 0);
    expect(envelope(0, D, 0)).toBe(0);
    expect(envelope(attack, D, 0)).toBeCloseTo(1, 10);
    expect(envelope(attack + release, D, 0)).toBe(0);
    expect(envelope(attack + release + 5000, D, 0)).toBe(0);
  });
  it('rises then falls monotonically', () => {
    const { attack, release } = envelopeTiming(D, 0);
    let prev = 0;
    for (let t = 0; t <= attack; t += 10) { const e = envelope(t, D, 0); expect(e).toBeGreaterThanOrEqual(prev); prev = e; }
    prev = 1;
    for (let t = attack; t <= attack + release; t += 10) { const e = envelope(t, D, 0); expect(e).toBeLessThanOrEqual(prev + 1e-12); prev = e; }
  });
  it('scales with the duration', () => {
    const a = envelopeTiming(1000, 0), b = envelopeTiming(2000, 0);
    expect(b.attack).toBeCloseTo(a.attack * 2);
    expect(b.release).toBeCloseTo(a.release * 2);
  });
  it('never outlasts the auto-advance interval (beyond the floor)', () => {
    const { release } = envelopeTiming(D, 1500);
    expect(release).toBeCloseTo(0.6 * 1500);
    // a very short interval is held to the floor, not to zero
    expect(envelopeTiming(D, 100).release).toBeCloseTo(0.3 * D);
  });
  it('smooth01 and unsmooth01 are inverses', () => {
    for (let x = 0; x <= 1; x += 0.05) expect(unsmooth01(smooth01(x))).toBeCloseTo(x, 8);
  });
});

describe('Rhythm', () => {
  beforeEach(() => Rhythm.reset());

  it('rests at exactly 0 and ends there', () => {
    expect(Rhythm.energy).toBe(0);
    Rhythm.trigger(D);
    expect(Rhythm.events).toBe(1);
    for (let i = 0; i < 400; i++) Rhythm.update(16);
    expect(Rhythm.energy).toBe(0);
    expect(Rhythm.active).toBe(false);
    expect(Rhythm.phase).toBe(1);
  });

  it('phase tracks the transition (0 -> 1 over the duration)', () => {
    Rhythm.trigger(1000);
    expect(Rhythm.phase).toBe(0);
    Rhythm.update(500);
    expect(Rhythm.phase).toBeCloseTo(0.5);
    Rhythm.update(900);
    expect(Rhythm.phase).toBe(1);
  });

  it('a retrigger mid-event continues from the current energy (no pop)', () => {
    Rhythm.trigger(D);
    for (let i = 0; i < 12; i++) Rhythm.update(16);
    const before = Rhythm.energy;
    expect(before).toBeGreaterThan(0.1);
    Rhythm.trigger(D);
    expect(Rhythm.energy).toBeCloseTo(before, 8);
    // also from the falling branch
    for (let i = 0; i < 60; i++) Rhythm.update(16);
    const falling = Rhythm.energy;
    expect(falling).toBeGreaterThan(0);
    expect(falling).toBeLessThan(1);
    Rhythm.trigger(D);
    expect(Rhythm.energy).toBeCloseTo(falling, 8);
  });

  it('hold freezes the clock at a fixed point in the event', () => {
    Rhythm.hold = 0.35;
    Rhythm.trigger(D);
    const e = Rhythm.energy;
    expect(e).toBeGreaterThan(0.9);
    for (let i = 0; i < 50; i++) Rhythm.update(16);
    expect(Rhythm.energy).toBe(e);
    expect(Rhythm.active).toBe(true);
  });

  it('update is a no-op at rest', () => {
    Rhythm.update(16);
    expect(Rhythm.energy).toBe(0);
  });
});

describe('Rhythm.setHold', () => {
  beforeEach(() => Rhythm.reset());
  it('holding at rest starts an event frozen at that point; releasing lets it play out', () => {
    Rhythm.setHold(0.35, 1000);
    expect(Rhythm.active).toBe(true);
    const e = Rhythm.energy;
    expect(e).toBeGreaterThan(0.9);
    Rhythm.update(500);
    expect(Rhythm.energy).toBe(e);
    Rhythm.setHold(null, 1000);
    for (let i = 0; i < 300; i++) Rhythm.update(16);
    expect(Rhythm.energy).toBe(0);
    expect(Rhythm.active).toBe(false);
  });
  it('moving the hold point moves the energy', () => {
    Rhythm.setHold(0.35, 1000);
    const peak = Rhythm.energy;
    Rhythm.setHold(1.5, 1000);
    expect(Rhythm.energy).toBeLessThan(peak);
  });
});
