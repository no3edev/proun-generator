import { describe, it, expect } from 'vitest';
import { paintSeed, paintSlots } from '../src/texture/paintSeed.js';

describe('paintSeed', () => {
  it('is deterministic per slot', () => {
    expect(paintSeed('cubeFixed', 2)).toEqual(paintSeed('cubeFixed', 2));
  });
  it('differs between slots and types, and stays in range', () => {
    expect(paintSeed('cubeFixed', 0)).not.toEqual(paintSeed('cubeFixed', 1));
    expect(paintSeed('cubeFixed', 0)).not.toEqual(paintSeed('circle', 0));
    const [x, y] = paintSeed('rod', 5);
    expect(x).toBeGreaterThanOrEqual(0); expect(x).toBeLessThan(97);
    expect(y).toBeGreaterThanOrEqual(0); expect(y).toBeLessThan(97);
  });
});


describe('paintSlots (what a strategy shape\'s paint is keyed by)', () => {
  const e = (type, index, role) => ({ type, index, ...(role ? { role } : {}) });

  it('is the index for a legacy shape, which has no role: legacy paint is exactly what it always was', () => {
    expect(paintSlots([e('beam', 0), e('beam', 1), e('circle', 0)])).toEqual([0, 1, 0]);
  });

  it('is the role and the ordinal within (type, role) for a strategy shape, independent of how the layout is numbered', () => {
    const a = paintSlots([e('beam', 0, 'support'), e('beam', 1, 'support'), e('beam', 2, 'connector'), e('circle', 0, 'anchor')]);
    expect(a).toEqual([2000, 2001, 3000, 1000]);
    // the same parts, in a different layout position / with a different index: the same slots
    const b = paintSlots([e('circle', 0, 'anchor'), e('beam', 0, 'connector'), e('beam', 1, 'support'), e('beam', 2, 'support')]);
    expect(b).toEqual([1000, 3000, 2000, 2001]);
  });

  it('gives different parts different paint, and the same part the same paint', () => {
    const seeds = [2000, 2001, 3000, 1000].map((slot) => paintSeed('beam', slot).join());
    expect(new Set(seeds).size).toBe(4);
    expect(paintSeed('beam', 2000)).toEqual(paintSeed('beam', 2000));
  });

  it('never collides a strategy slot with a legacy index (legacy indexes stay far below 1000)', () => {
    expect(paintSlots([e('beam', 0, 'detail')])[0]).toBeGreaterThanOrEqual(1000);
  });
});
