import { microJitter } from './noise.js';

// Layer 3 of the material system: a very subtle, deliberately-
// procedural pass applied last, on top of the paper+pigment structure
// (see PaperTexture.js, PigmentLayer.js). It exists to break up
// perfectly flat digital color, not to represent any physical
// material — so no real texture asset is needed here, unlike the
// other two layers.
//
// This is also the intended future home for animation: right now it's
// a one-time per-pixel jitter baked into a static canvas at build
// time. Making it move — "barely perceptible animation," per the
// brief — means replacing this call with a small ShaderMaterial pass
// driven by a uTime uniform, without touching the paper or pigment
// layers at all. Isolating it in its own module now, even though it's
// a one-line wrapper, is what keeps that swap contained later.
export function applyMicroVariation(ctx, w, h, amplitude = 0.015) {
  microJitter(ctx, w, h, amplitude);
}
