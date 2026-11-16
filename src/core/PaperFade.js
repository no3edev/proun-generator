// @ts-check
import * as THREE from 'three';
import { EASES } from './schedule.js';
import { DYNAMICS } from '../config/defaults.js';

// The background's colour over a change (Stage 7.6). The shapes take a whole transition window to change, each on its own timeline,
// but the paper (the ground's colour, the clear colour, the edge tint and the hatching's paper and ink) used to be set in ONE frame the
// moment the palette changed: with Auto showing curated presets, whose palettes differ, the whole background jumped while the shapes
// were still on their way. This fades it, over the same window and on the same animation clock, with a gentle ease.
//
// It starts from the colours on screen, so an interruption never jumps; it ends on exactly the target colours (what a fresh start would
// show); under the lab's pause it shows the state at that fraction of the window, like the tweens. DOM-free: `apply` is given the
// colours and does the setting.

/** Lab switch: false = the paper changes in one frame, as it did before 7.6. */
export const paperFadeSettings = { enabled: DYNAMICS.motion.paperFade };

/** @param {boolean} enabled */
export function setPaperFadeEnabled(enabled) { paperFadeSettings.enabled = !!enabled; }

/**
 * @param {{ apply: (paper: THREE.Color, ink: THREE.Color) => void }} o
 */
export function createPaperFade({ apply }) {
  const paper = new THREE.Color(), ink = new THREE.Color();             // what is on screen
  const fromPaper = new THREE.Color(), fromInk = new THREE.Color();
  const toPaper = new THREE.Color(), toInk = new THREE.Color();
  let elapsed = 0, duration = 0, active = false, started = false;

  function show() { apply(paper, ink); }

  return {
    /** The colours at once (the first picture, a restored session): no fade. @param {THREE.ColorRepresentation} p @param {THREE.ColorRepresentation} i */
    setNow(p, i) {
      active = false;
      paper.set(p); ink.set(i); started = true;
      show();
    },

    /**
     * Fades from what is on screen to the new colours over `durationMs`; at once if there is nothing to fade (the first call, no
     * duration, the switch off, no change).
     * @param {THREE.ColorRepresentation} p @param {THREE.ColorRepresentation} i @param {number} durationMs
     */
    fadeTo(p, i, durationMs) {
      toPaper.set(p); toInk.set(i);
      if (!started || !paperFadeSettings.enabled || !(durationMs > 0)) { this.setNow(p, i); return; }
      if (toPaper.equals(paper) && toInk.equals(ink) && !active) return;
      fromPaper.copy(paper); fromInk.copy(ink);
      elapsed = 0; duration = durationMs; active = true;
    },

    /**
     * One frame. @param {number} dt animation ms (core/frameClock.js) @param {number | null} [hold] the lab pause: a fraction of the window to show
     * @returns {boolean} whether the colours changed
     */
    update(dt, hold = null) {
      if (!active) return false;
      elapsed = hold !== null && hold !== undefined ? hold * duration : elapsed + dt;
      if (elapsed >= duration) {
        paper.copy(toPaper); ink.copy(toInk);
        active = false;
      } else {
        const e = EASES.sine(Math.max(0, elapsed) / duration);
        paper.lerpColors(fromPaper, toPaper, e);
        ink.lerpColors(fromInk, toInk, e);
      }
      show();
      return true;
    },

    isActive: () => active,
    /** The colours on screen (diagnostics and tests). */
    current: () => ({ paper: paper.clone(), ink: ink.clone() })
  };
}
