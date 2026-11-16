# Palettes (v0.11.0)

Eleven palettes, revised against the reference Prouns. The colours were measured (k-means in Lab on the paintings, gouaches and lithographs), not remembered.
A palette is `{ paper, ink, accents[5] }` in `src/palette/palettes.js`; the generator splits the accents into saturated hues (HSL S >= 0.5; a scene uses at most one)
and neutrals that stand at least 0.09 of luma clear of the paper (`splitPalette`, strategies/common.js). `tests/palettes.test.js` enforces the rules below.

## Rules every palette follows
- A greige ground, never pure white: luma 0.60-0.95 (the references run from the mid-grey `#a8a59e` to the pale `#e7ddc7`).
- A painter's/printer's black: ink luma <= 0.2 and no `#000000` anywhere (the references' blacks are `#0b0c0e`-`#2a2d2e`). Ink drives the shadow-plane colour.
- At least three neutrals clear of the paper, spanning at least 0.25 of the luma scale, so a scene has a tonal range.
- At most two saturated hues; none is a deliberate monochrome (the lithographs, the graphite Prouns). At least two monochromes and one mid-grey ground must exist.
- No two palettes are near-duplicates (paper dE < 8 **and** accents matching one for one within dE 9).
- `Proun — classic` is pinned exactly: goldens, render-guard baselines and old presets rest on it.

## The palettes
| Palette | Ground | Colour | After |
|---|---|---|---|
| Proun — classic | `#e9e4d8` | red `#c1362b`, warm greys | the default (unchanged) |
| Proun — cool grey | `#e3e6e4` | slate blue, red, cool greys | unchanged |
| Red Wedge — white ground | `#f1f0ec` | deep red `#b8161f`, hard black, cold greys | the poster; made starker so it is not classic's twin |
| Proun 99 — ochre suspension | `#e0c888` | red `#ac362a`, brown, white, warm grey | the gouache on ochre paper (was `#e8c765`, too saturated) |
| Proun 19D — wood and slate | `#dfddd2` | yellow-ochre `#c9a63f`, wood `#77684d`, sage grey, black-brown | the dense diagonal Proun with the ochre disc |
| Proun — grey ground | `#a8a59e` | brick `#a9462f`, black, white, warm greys | the grey Proun with black and white volumes; the one mid-grey ground |
| Proun — pale graphite | `#d9d9d5` | none | cold scans of the graphite Prouns (monochrome) |
| Proun — cream and vermilion | `#efe1ce` | vermilion `#de432d`, brick `#a9332b`, rose-brown greys | the red Prouns and the book covers |
| Proun — lithograph on cream | `#e4d8bd` | none | the lithographs: warm cream paper, a scale of warm greys (monochrome) |
| Proun — gouache on toned paper | `#c8bfa2` | none | a black gouache disc on toned greige paper (monochrome) |
| Wolkenbügel — steel grey | `#d9dad8` | steel blue, brown, greys | unchanged |

## Removed names (they still load: `PALETTE_ALIASES`)
Warm ochre -> Proun 99; Proun Room -> pale graphite; The Constructor -> gouache on toned paper; For the Voice, Pelikan, Kestner Portfolio -> cream and vermilion;
Black Square, USSR Pavilion -> classic; Proun G7 -> cool grey. Presets, share links, history and saved sessions that name an old palette get its successor
(`resolvePalette` in `SceneConfig.js`; an unknown name keeps the palette in force). The look of such a preset changes with the palette.
Reasons: six palettes were near-duplicates (red + warm greys on near-white); "Black Square" is Malevich's; cobalt and flat primaries (Pelikan, Kestner) are
the least Lissitzky-like; pure-black inks were off.

## Not done
Per-palette ground character (a craquelure ground for the grey Proun, wood for 19D) was left out by decision.
The colour analysis is rough (JPEG thumbnails, sRGB, dE76); the gallery under the real renderer (`tools/verify/palette_sheet.py`) is the check that counts.
