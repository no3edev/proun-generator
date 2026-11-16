import { SceneConfig } from '../config/store.js';
import { Rhythm } from '../core/Rhythm.js';
import { setHatchParams } from '../texture/hatch.js';
import { surfaceMode } from '../texture/paintSeed.js';
import { setFrontParams, setPaintParams, setEdgeParams, setResponseParams } from '../texture/PigmentResponse.js';
import { setGroundParams, groundMotion, setGroundMotionParams, groundCacheStats } from '../texture/GroundLayer.js';
import { setColorFront } from '../core/Tween.js';
import { setStagger } from '../core/schedule.js';
import { setPaperFadeEnabled } from '../core/PaperFade.js';
import { createLab } from './labSettings.js';

// Connects the lab's values to the systems that read them. This is the one
// place that knows where each lab key lands; adding a shader parameter means
// a schema entry (labSettings.js) plus a line in apply() here.

function safeStorage() {
  try { return window.localStorage; } catch (err) { return null; }
}

export const Lab = createLab(safeStorage());

function apply(v) {
  setColorFront({ enabled: v.colorFront, delay: v.colorDelay });
  setStagger({ amount: v.stagger });
  setPaperFadeEnabled(v.paperFade);
  setFrontParams({ soft: v.colorSoft, grain: v.colorGrain, tone: v.colorTone });
  setResponseParams({ on: v.respOn, edge: v.respEdge, softness: v.respSoft, tooth: v.respTooth });
  surfaceMode.evolve = !!v.surfEvolve;
  setHatchParams({ on: v.hatchOn, spacing: v.hatchSpacing, width: v.hatchWidth, light: v.hatchLight, dark: v.hatchDark, wobble: v.hatchWobble, breaks: v.hatchBreaks });
  setEdgeParams({ on: v.edgeOn, width: v.edgeWidth, thinning: v.edgeThin, pooling: v.edgePool, softness: v.edgeSoft, irregularity: v.edgeIrr });
  setPaintParams({ on: v.paintOn, visibility: v.paintVis, strokeScale: v.strokeScale, strokeLength: v.strokeLength, followStrokes: v.followStrokes, followStains: v.followStains });
  setGroundParams({ on: v.groundOn, visibility: v.groundVis, scale: v.groundScale, cracks: v.groundCracks, crackScale: v.groundCrackSize, crackStretch: v.groundCrackStretch, crackVary: v.groundCrackVary });
  groundMotion.enabled = v.gmOn;
  groundMotion.delay = v.gmDelay;
  groundMotion.duration = v.gmDuration;
  setGroundMotionParams({ evolve: v.gmEvolve, warp: v.gmWarp, lift: v.gmLift });
  Rhythm.setHold(v.holdOn ? v.hold : null, SceneConfig.get().time.durationMs);
}

export function initLab() {
  apply(Lab.values());
  Lab.subscribe(apply);
  // handy from the console while developing
  window.__proun = { Rhythm, Lab, groundMotion, groundCacheStats };
}
