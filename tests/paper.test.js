import { describe, it, expect, beforeEach } from 'vitest';
import { OVERLAY_OPACITY } from '../src/config/defaults.js';
import { Rhythm } from '../src/core/Rhythm.js';
import { paperResponse, updatePaperResponse, overlayOpacity } from '../src/core/PaperResponse.js';

describe('Rhythm.energyAt', () => {
  beforeEach(() => Rhythm.reset());
  const p = { attack: 0.5, release: 2, releaseMaxOfInterval: 0.9, releaseMin: 0.3 };
  it('is 0 at rest and before its delay, then rises later than the main energy', () => {
    expect(Rhythm.energyAt(0.25, p)).toBe(0);
    Rhythm.trigger(1000);
    Rhythm.update(200);            // inside the delay (250 ms)
    expect(Rhythm.energyAt(0.25, p)).toBe(0);
    expect(Rhythm.energy).toBeGreaterThan(0);
    // the main envelope peaks at 350 ms; the delayed one is still rising then
    Rhythm.update(150);
    expect(Rhythm.energyAt(0.25, p)).toBeLessThan(Rhythm.energy);
  });
  it('ends at 0', () => {
    Rhythm.trigger(1000);
    for (let i = 0; i < 600; i++) Rhythm.update(16);
    expect(Rhythm.energyAt(0.25, p)).toBe(0);
  });
});

describe('paper response', () => {
  beforeEach(() => { Rhythm.reset(); paperResponse.enabled = true; updatePaperResponse(); });
  it('is exactly the resting opacity at rest', () => {
    expect(overlayOpacity()).toBe(OVERLAY_OPACITY);
  });
  it('deepens during an event and returns exactly to rest', () => {
    Rhythm.trigger(1000);
    let max = 0;
    for (let i = 0; i < 400; i++) { Rhythm.update(16); updatePaperResponse(); max = Math.max(max, overlayOpacity()); }
    expect(max).toBeGreaterThan(OVERLAY_OPACITY + 0.05);
    expect(max).toBeLessThanOrEqual(1);
    expect(overlayOpacity()).toBe(OVERLAY_OPACITY);
  });
  it('can be switched off', () => {
    paperResponse.enabled = false;
    Rhythm.setHold(0.8, 1000);
    updatePaperResponse();
    expect(overlayOpacity()).toBe(OVERLAY_OPACITY);
  });
});
