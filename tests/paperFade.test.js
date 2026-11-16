import { describe, it, expect, beforeEach } from 'vitest';
import * as THREE from 'three';
import { createPaperFade, setPaperFadeEnabled, paperFadeSettings } from '../src/core/PaperFade.js';
import { DYNAMICS } from '../src/config/defaults.js';

// Stage 7.6: the paper (ground, clear colour, edge tint, hatching paper and ink) fades over a change instead of jumping in the first
// frame of it. Found in use: in the curated sequence every preset has its own palette, so the background cut while the shapes were
// still on their way.

function rig() {
  const log = [];
  const fade = createPaperFade({ apply: (paper, ink) => log.push({ paper: paper.clone(), ink: ink.clone() }) });
  return { fade, log, last: () => log[log.length - 1] };
}
const cream = '#e8e0cc', ochre = '#d9b56a', graphite = '#2b2b2b', red = '#c0392b';
const W = 60_000;

describe('PaperFade', () => {
  beforeEach(() => setPaperFadeEnabled(true));

  it('the first colours are set at once; the switch is on by default', () => {
    expect(DYNAMICS.motion.paperFade).toBe(true);
    expect(paperFadeSettings.enabled).toBe(true);
    const { fade, last } = rig();
    fade.fadeTo(cream, graphite, W);                         // nothing on screen yet: nothing to fade from
    expect(fade.isActive()).toBe(false);
    expect(last().paper.getHex()).toBe(new THREE.Color(cream).getHex());
    expect(last().ink.getHex()).toBe(new THREE.Color(graphite).getHex());
  });

  it('a change fades from what is on screen to the new colours over the window, starting with no jump and ending exactly on them', () => {
    const { fade, log, last } = rig();
    fade.setNow(cream, graphite);
    fade.fadeTo(ochre, red, W);
    expect(fade.isActive()).toBe(true);
    fade.update(0);
    expect(last().paper.equals(new THREE.Color(cream))).toBe(true);        // the first frame is the old paper
    expect(last().ink.equals(new THREE.Color(graphite))).toBe(true);
    fade.update(W / 2);                                                    // the sine ease is 0.5 at half
    const mid = new THREE.Color().lerpColors(new THREE.Color(cream), new THREE.Color(ochre), 0.5);
    expect(last().paper.r).toBeCloseTo(mid.r, 9); expect(last().paper.g).toBeCloseTo(mid.g, 9); expect(last().paper.b).toBeCloseTo(mid.b, 9);
    const midInk = new THREE.Color().lerpColors(new THREE.Color(graphite), new THREE.Color(red), 0.5);
    expect(last().ink.r).toBeCloseTo(midInk.r, 9);
    fade.update(W / 2);
    expect(last().paper.equals(new THREE.Color(ochre))).toBe(true);        // exactly, not nearly
    expect(last().ink.equals(new THREE.Color(red))).toBe(true);
    expect(fade.isActive()).toBe(false);
    const n = log.length; fade.update(1000); expect(log.length).toBe(n);   // and then it is quiet
  });

  it('is smooth: every channel moves one way, no frame steps more than the ease allows (60 s at 20 fps)', () => {
    const { fade, log } = rig();
    fade.setNow(cream, graphite);
    fade.fadeTo(ochre, red, W);
    const from = new THREE.Color(cream), to = new THREE.Color(ochre);
    log.length = 0;
    for (let t = 0; t < W + 50; t += 50) fade.update(50);
    let prev = from.clone(); let maxStep = 0;
    for (const f of log) {
      for (const ch of ['r', 'g', 'b']) {
        const d = f.paper[ch] - prev[ch];
        const dir = Math.sign(to[ch] - from[ch]);
        expect(d * dir, ch).toBeGreaterThanOrEqual(-1e-12);
        maxStep = Math.max(maxStep, Math.abs(d));
      }
      prev = f.paper.clone();
    }
    // the sine's top speed is pi/2 x distance / window: one 50 ms frame moves at most that much
    const dist = Math.max(Math.abs(to.r - from.r), Math.abs(to.g - from.g), Math.abs(to.b - from.b));
    expect(maxStep).toBeLessThanOrEqual((Math.PI / 2) * dist * (50 / W) + 1e-9);
  });

  it('an interruption starts from the colours on screen (no jump) and ends on the new target', () => {
    const { fade, last } = rig();
    fade.setNow(cream, graphite);
    fade.fadeTo(ochre, red, W);
    fade.update(0.3 * W);
    const shown = last().paper.clone();
    fade.fadeTo(graphite, cream, 10_000);
    fade.update(0);
    expect(last().paper.r).toBeCloseTo(shown.r, 12); expect(last().paper.g).toBeCloseTo(shown.g, 12); expect(last().paper.b).toBeCloseTo(shown.b, 12);
    fade.update(10_000);
    expect(last().paper.equals(new THREE.Color(graphite))).toBe(true);
    expect(last().ink.equals(new THREE.Color(cream))).toBe(true);
  });

  it('is immediate when there is no window, no number, or the lab switch is off; a change to the same colours does nothing', () => {
    for (const d of [0, -5, NaN, undefined]) {
      const { fade, last } = rig(); fade.setNow(cream, graphite); fade.fadeTo(ochre, red, d);
      expect(fade.isActive()).toBe(false); expect(last().paper.equals(new THREE.Color(ochre))).toBe(true);
    }
    setPaperFadeEnabled(false);
    const off = rig(); off.fade.setNow(cream, graphite); off.fade.fadeTo(ochre, red, W);
    expect(off.fade.isActive()).toBe(false); expect(off.last().paper.equals(new THREE.Color(ochre))).toBe(true);
    setPaperFadeEnabled(true);
    const same = rig(); same.fade.setNow(cream, graphite); const n = same.log.length; same.fade.fadeTo(cream, graphite, W);
    expect(same.fade.isActive()).toBe(false); expect(same.log.length).toBe(n);
  });

  it('under the lab pause it shows the state at that fraction of the window, whatever the frame time, and goes on from there on release', () => {
    const { fade, last } = rig();
    fade.setNow(cream, graphite);
    fade.fadeTo(ochre, red, W);
    fade.update(16, 0.5);
    const half = last().paper.clone();
    fade.update(16, 0.5); fade.update(16, 0.5);
    expect(last().paper.equals(half)).toBe(true);                          // standing still
    fade.update(16, 0.25);
    expect(last().paper.r).not.toBeCloseTo(half.r, 6);                     // the slider can go back
    fade.update(16, 1);
    expect(last().paper.equals(new THREE.Color(ochre))).toBe(true);        // and to the end
    expect(fade.isActive()).toBe(false);
  });

  it('current() is what is on screen', () => {
    const { fade } = rig();
    fade.setNow(cream, graphite);
    fade.fadeTo(ochre, red, W); fade.update(W / 2);
    expect(fade.current().paper.r).toBeGreaterThan(Math.min(new THREE.Color(cream).r, new THREE.Color(ochre).r) - 1e-9);
    fade.update(W);
    expect(fade.current().paper.equals(new THREE.Color(ochre))).toBe(true);
  });
});
