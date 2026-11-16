# The Library (v0.13.0)

Eleven built-in presets after Lissitzky's Prouns, shown in the Presets panel under **LIBRARY** (read-only; ▶ loads, ⧉ saves a copy into your own list, which is capped at 20)
and shipped as an importable file, `presets/proun-library.json` (Presets > Import). Data: `src/presets/library.js` (generated). A preset is a complete config
(seed, palette, orientation, strategy, every shape's count/size/spread/snap), so it loads the same whatever the app was set to before.

## What they are, and how close
A preset is a seed plus settings: the generator composes by its own rules (three strategies), so these are *compositions in the manner of* the works, found by search, not copies.
"Close" = the main masses, direction and elements line up; "loose" = same family and feel, different arrangement.

| Preset | After | Palette / strategy / format | Fit |
|---|---|---|---|
| Floating blocks on pale ground | the Proun on the cracked grey ground (blocks in the upper centre, marks at the far edges) | pale graphite / central cluster / square | **close** |
| Suspension on ochre | the gouache on ochre: red bar, block, planes, hanging sphere | ochre / axis thrust / portrait | loose: the red sphere, the grey diagonal beam and the frame; no string, no white block |
| Diagonals with the ochre disc | Proun 19D | 19D / disc and beams / square | loose: sparser than the dense original |
| The floating cube | the grey Proun with the cube on the dark column | grey ground / **cross (column)** / portrait | **close**: cube across a tall dark column, thin red lines, a wide low triangle; no arcs or grid |
| Crossing beams | the pale Proun of two huge beams over a block | lithograph on cream / axis thrust / portrait | loose |
| Red bar and frame | the red bar, black rectangle and diamond outline | cream and vermilion / **cross** / portrait | **close**: upright red bar, black rectangle, grey end planes, crossbar, diamond outline |
| Great box on a turned grid | the graphite lithograph with one large box | pale graphite / **mass** / square | loose-to-close: a pale turned slab with a dark box and a lighter block on it; no arcs or fine lines |
| Black disc and plane | the gouache of a black disc and a grey parallelogram | gouache on toned paper / disc and beams / portrait | **close in spirit**: no hairline crossbars |
| Long diagonal | the lithograph of the long rising beam | lithograph on cream / **mass** / landscape | loose: a stepped dark mass crossed by a long rising beam; the original is horizontal and denser |
| Disc and boxes | the lithograph of the great pale disc with boxes | lithograph on cream / **mass** / landscape | **close**: a pale disc on a dark framed field with a dark assembly of boxes and a long rising beam; no hatching |
| The tall tower | the lithograph of the tall stepped tower | lithograph on cream / **tower** / portrait | loose-to-close: stepped upright stack leaving the frame, a floating pale plane with a bar, long hairlines; plainer |

## How they were made
1. `tools/presets/describe_refs.py` measures each reference (the project's eight images and the six lithographs): ink coverage, centroid, spread, main axis, a 3x3 grid of where the mass sits.
2. `tools/presets/specs.mjs` states per target the strategy, format, palette and shape counts (and per-shape size/snap overrides).
3. `tools/presets/search.mjs` generates 12,000 seeds per target, rasterizes each layout into the same ink grid and scores it against the reference (a few targets also require a feature, e.g. a red sphere).
4. `tools/presets/render_candidates.py` renders the best three beside the reference; the choice was made by eye (`library_entries.mjs` records it).
5. `tools/presets/build_library.mjs` writes the library file and the JSON; `tools/presets/render_library.py` loads each through the panel and shoots it.
Re-run any step with the commands in `tools/presets/*`.

**v0.13.1:** Mass gained pale backdrops (see the release notes), which re-picked Disc and boxes (new seed) and re-coloured Great box on a turned grid (same seed). **v0.13.0:** six presets were re-picked under the new Tower, Cross and Mass strategies (the red bar, the cube, the graphite box, the long diagonal, the disc and boxes, and the tall tower which was left out before); the other five keep their picks. The search gained a compactness term (the number of separate ink masses against the reference's) and, for the older strategies, optional sweeps of spread, size and snap rotation (`VARIANTS=1`): those lowered the score by scattering and shrinking the forms, which looked worse, so the picks use each strategy's native spread and size.

## Pinned
`tests/library.test.js`: 10-12 presets, unique names, complete valid configs, rebuild-from-entries equal, load-through-replace exact, search path = app path, the JSON equals the library,
import and "Save a copy" work; `tests/golden/library.json` pins every preset's layout (re-pin with `node tools/presets/update_library_golden.mjs` only when a preset or the generator is meant to change).

## Limits, and what was left out
- **Upright compositions need the Tower and Cross strategies.** The three older strategies thrust along rising or falling diagonals (12-60 degrees) and per-shape snap rotation does not change that; the presets that need verticals use the new ones.
- **Left out:** the two figurines from *Victory over the Sun* (they are not Prouns and no strategy builds a figure).
- **No hatching, arcs, grids or hairline construction**: those are marks, not shapes of the generator.
- Presets saved earlier in your browser stay as they are; one that named a removed palette now loads with that palette's successor (see `docs/PALETTES.md`).
