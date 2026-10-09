import { describe, it, expect } from 'vitest';
import { clampDuration, clampInterval, TIME } from '../src/config/defaults.js';

describe('clampDuration', () => {
  it('passes through in-range values', () => {
    expect(clampDuration(1500)).toBe(1500);
  });
  it('clamps to the configured range', () => {
    expect(clampDuration(-5)).toBe(TIME.durationMs.min);
    expect(clampDuration(0)).toBe(TIME.durationMs.min);
    expect(clampDuration(1e9)).toBe(TIME.durationMs.max);
  });
  it('accepts numeric strings (raw input values)', () => {
    expect(clampDuration('900')).toBe(900);
  });
  it('falls back to the default for NaN / junk / empty', () => {
    for (const bad of [NaN, undefined, null, 'abc', '', Infinity]) {
      expect(clampDuration(bad)).toBe(TIME.durationMs.default);
    }
  });
});

describe('clampInterval', () => {
  it('clamps negative and tiny intervals (which made setInterval fire continuously)', () => {
    expect(clampInterval(-100)).toBe(TIME.intervalMs.min);
    expect(clampInterval(1)).toBe(TIME.intervalMs.min);
  });
  it('clamps large values and defaults on junk', () => {
    expect(clampInterval(10 ** 9)).toBe(TIME.intervalMs.max);
    expect(clampInterval(undefined)).toBe(TIME.intervalMs.default);
  });
});
