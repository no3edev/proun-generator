import { describe, it, expect } from 'vitest';
import { paintSeed } from '../src/texture/paintSeed.js';

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
