import { describe, it, expect } from 'vitest';
import { hashSeed, mulberry32, createRng, randomSeed } from '../src/generator/rng.js';

const take = (rng, n) => Array.from({ length: n }, () => rng());

describe('mulberry32', () => {
  it('is deterministic for a given seed', () => {
    expect(take(mulberry32(42), 20)).toEqual(take(mulberry32(42), 20));
  });
  it('differs between seeds', () => {
    expect(take(mulberry32(1), 5)).not.toEqual(take(mulberry32(2), 5));
  });
  it('stays within [0, 1)', () => {
    for (const v of take(mulberry32(7), 5000)) {
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThan(1);
    }
  });
  it('is roughly uniform', () => {
    const vals = take(mulberry32(123), 20000);
    const mean = vals.reduce((a, b) => a + b, 0) / vals.length;
    expect(mean).toBeGreaterThan(0.48);
    expect(mean).toBeLessThan(0.52);
  });
});

describe('hashSeed / createRng', () => {
  it('returns a uint32', () => {
    const h = hashSeed(123, 'sphere', 4);
    expect(Number.isInteger(h)).toBe(true);
    expect(h).toBeGreaterThanOrEqual(0);
    expect(h).toBeLessThan(2 ** 32);
  });
  it('depends on every part, including order', () => {
    expect(hashSeed(1, 'a', 0)).not.toBe(hashSeed(1, 'a', 1));
    expect(hashSeed(1, 'a', 0)).not.toBe(hashSeed(1, 'b', 0));
    expect(hashSeed(1, 'a', 0)).not.toBe(hashSeed(2, 'a', 0));
    expect(hashSeed('a', 'b')).not.toBe(hashSeed('b', 'a'));
  });
  it('does not confuse part boundaries', () => {
    expect(hashSeed('ab', 'c')).not.toBe(hashSeed('a', 'bc'));
  });
  it('createRng streams are reproducible and independent', () => {
    expect(take(createRng(9, 'x', 0), 8)).toEqual(take(createRng(9, 'x', 0), 8));
    expect(take(createRng(9, 'x', 0), 8)).not.toEqual(take(createRng(9, 'x', 1), 8));
  });
});

describe('randomSeed', () => {
  it('returns uint32 values that vary', () => {
    const seeds = new Set(Array.from({ length: 20 }, randomSeed));
    expect(seeds.size).toBeGreaterThan(15);
    for (const s of seeds) {
      expect(Number.isInteger(s)).toBe(true);
      expect(s).toBeGreaterThanOrEqual(0);
      expect(s).toBeLessThan(2 ** 32);
    }
  });
});
