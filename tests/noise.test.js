import { describe, it, expect } from 'vitest';
import { microJitter, withNoiseSeed } from '../src/texture/noise.js';

// a stand-in for a 2D canvas context: just the pixel buffer microJitter touches
function fakeCtx(w, h) {
  const data = new Uint8ClampedArray(w * h * 4).fill(128);
  return { data, getImageData: () => ({ data }), putImageData: () => {} };
}
const run = (parts) => {
  const ctx = fakeCtx(16, 16);
  withNoiseSeed(parts, () => microJitter(ctx, 16, 16, 0.2));
  return Array.from(ctx.data);
};

describe('seeded noise', () => {
  it('the same seed gives the same grain, every time', () => {
    expect(run(['paper'])).toEqual(run(['paper']));
  });
  it('different streams give different grain', () => {
    expect(run(['paper'])).not.toEqual(run(['pool', 0]));
    expect(run(['pool', 0])).not.toEqual(run(['pool', 1]));
  });
  it('does not depend on what was drawn before (no shared global stream)', () => {
    const first = run(['pool', 2]);
    run(['pool', 0]); run(['paper']);
    expect(run(['pool', 2])).toEqual(first);
  });
  it('restores the previous stream afterwards', () => {
    const a = fakeCtx(8, 8), b = fakeCtx(8, 8);
    withNoiseSeed(['x'], () => { microJitter(a, 8, 8, 0.2); });
    withNoiseSeed(['x'], () => { microJitter(b, 8, 8, 0.2); });
    expect(Array.from(a.data)).toEqual(Array.from(b.data));
  });
});
