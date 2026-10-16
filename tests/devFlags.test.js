import { describe, it, expect } from 'vitest';
import { parseDevFlags } from '../src/config/devFlags.js';

describe('parseDevFlags', () => {
  it('defaults: dynamics on, nothing held, amp 1, not dev', () => {
    expect(parseDevFlags('')).toEqual({ dynamics: true, hold: null, amp: 1, dev: false });
  });
  it('reads dyn / hold / amp', () => {
    expect(parseDevFlags('?dyn=0&hold=0.35&amp=1.5')).toEqual({ dynamics: false, hold: 0.35, amp: 1.5, dev: true });
  });
  it('clamps and ignores junk', () => {
    const f = parseDevFlags('?hold=99&amp=-3');
    expect(f.hold).toBe(6);
    expect(f.amp).toBe(0);
    expect(parseDevFlags('?hold=abc&amp=').hold).toBeNull();
    expect(parseDevFlags('?amp=').amp).toBe(1);
  });
});
