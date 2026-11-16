# Proun Generator — Next Development Phase Roadmap

## Project goal

Evolve the current functional MVP into a generative system inspired by El Lissitzky’s Proun works.

The objective is not simply to add more primitives or visual effects. The generator should produce compositions with a convincing Proun-like spatial language: architectural structures, ambiguous depth, intersecting planes, deliberate tonal contrasts, graphic elements, and a restrained analog surface.

The project should retain its existing architecture where practical. Improvements must be incremental, reproducible, and based on the actual codebase.

## Working rules

- You maintain the codebase. Inspect the current implementation before proposing changes.
- Do not assume that previous documentation accurately describes the current code.
- Read the project documentation, configuration schemas, source code, and existing development notes before starting.
- Preserve working features, existing presets, configuration compatibility, seeded randomness, and user settings unless a change is explicitly approved.
- Do not rewrite major systems merely to accommodate a new feature.
- Keep the UI minimal. Put experimental parameters in the existing lab where appropriate rather than exposing every parameter in the main interface.
- Do not implement multiple roadmap stages in a single unreviewed change.
- Before each stage, identify dependencies, risks, affected files, and acceptance criteria.
- After each stage, run the available tests, TypeScript checks, and build. Report anything that could not be verified.
- Ask questions when artistic intent or a technical decision is genuinely ambiguous. Do not silently invent requirements.

## Stage 0 — Codebase audit and implementation plan

Read the current source tree and documentation. Establish the actual state of the project before modifying anything.

Pay particular attention to:

- Shape registry and geometry generation.
- Composition generation and seeded randomness.
- Collision resolution and shape dispersal.
- Scene configuration and preset serialization.
- Material and texture shaders.
- Graphic shading and current lighting.
- Tweening, Rhythm, and composition-change events.
- Material laboratory and existing UI.
- Rendering performance, resource disposal, and long-running animation behavior.

Deliverables:

1. A concise architecture map showing the current data flow.
2. A list of existing capabilities, incomplete features, and technical limitations.
3. A comparison between the current implementation and this roadmap.
4. A dependency-aware implementation plan, including any proposed schema or API changes.
5. A list of decisions requiring my approval.

Do not implement features during this stage. Resolve discrepancies between the documentation and actual code first.

## Stage 1 — Lissitzky reference analysis and compositional grammar

Study a curated set of approximately 12–20 Proun works, including architectural compositions and examples with grids, curved structures, intersecting planes, and strong tonal contrasts.

Extract recurring visual principles rather than copying individual works.

Identify:

- Dominant axes and directional relationships.
- Primary masses, secondary structures, and accents.
- Relationships between volumes, frames, grids, and flat planes.
- Depth ambiguity and projected overlap.
- Tonal hierarchy and graphic shadows.
- Color relationships and negative space.
- Recurring geometric and graphic elements.

Deliverables:

1. A compact visual specification.
2. A taxonomy of shape families and compositional roles.
3. Three to five proposed composition strategies.
4. A mapping from each principle to a possible implementation in the current architecture.
5. A small set of visual acceptance criteria.

Do not implement the full composition engine yet. Present the findings for review.

## Stage 2 — Geometry and composition engine

Extend the existing shape registry rather than introducing a parallel system.

Investigate and, where justified, implement these shape families:

- Volumes: existing solids and useful variations.
- Frames and grids: open cuboids, repeated bars, structural lattices.
- Curved structures: arches, rings, partial rings, extruded curved profiles.
- Graphic elements: thin planes, lines, connectors, and shadow planes.

Introduce compositional roles where useful, such as anchor, support, connector, foreground, and detail.

Implement a small number of composition strategies. Randomness should operate within compositional constraints rather than determine the entire arrangement independently.

Acceptance criteria:

- Existing shapes and presets continue to work.
- New shapes have predictable dimensions and orientations.
- The same seed reproduces the same composition.
- Generated scenes exhibit a discernible structural hierarchy.
- New composition rules remain configurable and testable.

## Stage 3 — Spatial distribution, collisions, and overlap

Audit the current CollisionResolver and dispersal module before changing their algorithms.

Separate three concerns:

1. Spatial distribution within a volume.
2. Resolution of unintended 3D intersections.
3. Projected overlap and visual composition.

Investigate controls for density, depth range, preferred separation, overlap tendency, structural cohesion, and solver relaxation.

Do not assume all projected overlaps are errors. Allow deliberate crossings and occlusions while avoiding accidental volume penetration where it damages the composition.

Add lab diagnostics where practical to distinguish 3D intersections from projected silhouette overlaps.

Acceptance criteria:

- Large shapes do not produce uncontrolled intersections under normal settings.
- The solver does not unnecessarily scatter a coherent composition.
- Intentional projected overlaps remain possible.
- Seeded results are reproducible.
- The solver's behavior can be diagnosed rather than tuned blindly.

## Stage 4 — Graphic tonal system

Develop a compositional shading system that does not depend entirely on physically realistic illumination.

Investigate:

- Face-based assignment of base, mid-tone, and shadow values.
- Selective highlights.
- Graphic shadow planes independent of actual light direction.
- Tonal profiles appropriate to different shape families.
- Palette-aware generation of darker and lighter variants.

Reuse the existing material and shader infrastructure where appropriate.

Acceptance criteria:

- Forms have a stronger tonal hierarchy and sense of depth.
- Highlights and shadows can be intentionally inconsistent with physical lighting.
- The result remains graphic and geometric rather than photorealistic.
- Existing palettes remain usable.
- The system avoids excessive controls and arbitrary per-object exceptions.

## Stage 5 — Procedural analog materials and edge treatment

Audit the existing texture and shader system before expanding it.

Develop a coordinated material model with three conceptual layers:

1. Support: stable paper tone, subtle grain, and low-frequency variation.
2. Pigment: uneven coverage, directional texture, and controlled tonal variation.
3. Edge and print character: subtle contour irregularity, narrow edge softness, and restrained registration imperfections.

Distinguish antialiasing, material edge softness, and global optical post-processing.

Prioritize geometry-aware surface effects over generic noise overlays. Keep texture deterministic where possible, with explicit control over whether surface patterns remain fixed or evolve over time.

Investigate how the existing Rhythm and composition events can drive subtle material responses.

Acceptance criteria:

- Geometry remains legible and crisp.
- Texture does not overwhelm the composition.
- Edge softness is subtle and controllable.
- Surface patterns are reproducible from configuration and seed.
- Materials can respond to transitions without becoming distracting.

Heavy blur, pronounced trails, and strong chromatic aberration are out of scope for the initial implementation.

## Stage 6 — Long-duration, staggered animation

Extend the current Tween and Rhythm systems rather than replacing them without evidence.

Target default timing:

- Hold: 15 minutes.
- Transition window: 1 minute.

Retain short timing presets for development and experimentation.

Introduce per-object motion scheduling with deterministic delays, durations, easing, and movement amplitudes. Large anchor structures and smaller details should be able to follow different motion profiles.

Coordinate geometry, tonal changes, and material responses without forcing every effect to start simultaneously.

Investigate transition interruption, retargeting, tab suspension, resuming, and long-running clock behavior.

Acceptance criteria:

- Objects transition without visible position or rotation jumps.
- Motion is staggered and compositionally coherent.
- A new target composition does not corrupt active tweens.
- Long hold periods remain visually stable.
- Material changes can follow geometry with independent delays.
- Playback remains reliable over extended sessions.
- Timing is configurable and does not depend on a particular frame rate.

## Stage 7 — Exhibition mode and final integration

Once the previous stages are stable, investigate:

- Minimal full-screen display mode.
- Optional automatic progression between compositions.
- Curated composition presets.
- Reliable saving and restoration of scene configurations.
- High-quality still-image export, if compatible with the current architecture.
- Long-session memory and GPU resource management.
- Optional restrained post-processing.

Do not prioritize exhibition features over the quality of the generated compositions.

Acceptance criteria:

- A scene can run for hours without progressive degradation.
- Presets and configuration restoration remain reliable.
- The interface can be hidden without disrupting playback.
- Exported images match the intended rendered composition.
- All major systems work together without introducing regressions.

## Cross-stage requirements

Maintain a small regression suite of fixed seeds and reference configurations.

For every stage:

1. Identify the affected modules and their contracts.
2. Implement the smallest coherent change.
3. Run available automated tests and checks.
4. Compare results against the fixed reference scenes.
5. Document configuration changes and migration requirements.
6. Report completed work, known limitations, and the next decision needed.

Avoid unrelated refactoring. Do not introduce new dependencies without explaining their value and maintenance cost.

## Priority order

1. Audit the codebase.
2. Establish the visual grammar.
3. Improve geometry and composition.
4. Resolve spatial behavior.
5. Improve tonal design.
6. Improve materials and edges.
7. Implement long-duration animation.
8. Add exhibition features and optional post-processing.

The central principle is to improve the generator's ability to construct convincing Proun-like compositions before adding more visual complexity.

Begin with Stage 0 only. Wait for my review before implementing Stage 1.

