// @ts-check
import { DYNAMICS, OVERLAY_OPACITY } from '../config/defaults.js';
import { Rhythm } from './Rhythm.js';

// The background's response to a composition change (prototype). Its own
// system, with its own timing: the paper-grain overlay deepens a little,
// starting after the shapes have begun to react and settling more slowly,
// then returns to exactly its resting opacity. Spatially it is the paper's
// own structure that becomes more visible, not a uniform tone change, so it
// supports the shapes instead of competing with them.
//
// The overlay lives in the DOM, so the PNG exporter reads the SAME live
// opacity (SceneManager.getOverlayOpacity) — export matches the screen.

export const paperResponse = {
  enabled: true,
  amount: DYNAMICS.paper.amount,
  delay: DYNAMICS.paper.delay,
  env: {
    attack: DYNAMICS.paper.attack,
    release: DYNAMICS.paper.release,
    releaseMaxOfInterval: DYNAMICS.envelope.releaseMaxOfInterval,
    releaseMin: DYNAMICS.envelope.releaseMin
  },
  /** 0..1, exactly 0 at rest */
  level: 0
};

/** Reads the shared clock; call once per frame after Rhythm.update. */
export function updatePaperResponse() {
  paperResponse.level = paperResponse.enabled
    ? Rhythm.energyAt(paperResponse.delay, paperResponse.env)
    : 0;
}

/** The overlay opacity right now. Exactly OVERLAY_OPACITY at rest. */
export function overlayOpacity() {
  return Math.min(1, OVERLAY_OPACITY + paperResponse.amount * paperResponse.level);
}
