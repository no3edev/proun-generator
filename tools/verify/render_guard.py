# RENDER GUARD (Stage 4.4): six reference stills of the composition strategies in the three tonal modes, compared with stored
# baselines, so a later change that moves the look (tones, shadow planes, highlights, paint, palette) cannot go unnoticed.
#
#   python3 tools/verify/render_guard.py            compare against tools/verify/baseline/ (exit 1 on a difference)
#   python3 tools/verify/render_guard.py --update   re-shoot the baselines (do this only when the look is MEANT to change,
#                                                   and look at the stills: the diff of the PNGs is the review)
#   --only axis-thrust-faceted   (repeatable) run just those scenes
#
# Each scene is shot on a fresh page, so any subset (--only) reproduces the same stills.
# Needs the app served (npm run dev -> NEW_URL, default http://localhost:5201/ ) and Playwright with Chromium. Software WebGL, seeded
# random streams, a fixed 1280x800 viewport (the canvas is then always 720x560), the picture waited out until it stops changing.
# It takes a few minutes, so it is NOT in `npm test`: run it detached (see README).
# A scene passes if at most MAX_OVER of its pixels differ by more than TOL in any channel (0..255): that absorbs small GPU and
# driver differences in antialiasing and in the paper's grain, and nothing a change of tone, shadow or highlight does.
import asyncio, os, sys, io, json
sys.path.insert(0, os.path.dirname(__file__))
from playwright.async_api import async_playwright
from shoot import new_page, grab
import numpy as np
from PIL import Image

URL = os.environ.get('NEW_URL', 'http://localhost:5201/')
HERE = os.path.dirname(os.path.abspath(__file__))
BASE = os.path.join(HERE, 'baseline')
OUT = os.environ.get('GUARD_OUT', '/tmp')
TOL, MAX_OVER = 6, 0.005
# the global share above misses a change that is small but concentrated (a highlight strip, a beam's shadow plane: Stage 4's own details),
# so the picture is also cut into BLOCKxBLOCK tiles and a scene fails if any one tile has more than BLOCK_MAX of its pixels over TOL
# (GPU antialiasing differences are thin lines along edges: a few percent of a tile)
BLOCK, BLOCK_MAX = 40, 0.15
INIT = 'window.__proun = {};'
# name, strategy, seed (the tonal mode each seed gets is fixed by toneModeFor: checked below)
SCENES = [
    ('axis-thrust-faceted', 'axis-thrust', 11, 'faceted'),
    ('axis-thrust-subtle', 'axis-thrust', 159, 'subtle'),
    ('disc-beams-subtle', 'disc-beams', 122, 'subtle'),
    ('disc-beams-pale', 'disc-beams', 418, 'pale'),
    ('central-cluster-faceted', 'central-cluster', 11, 'faceted'),
    ('central-cluster-pale', 'central-cluster', 529, 'pale'),
    # Mass has no tonal mode (its tone is the backdrop's and the assembly's own): the hatched backdrop (v0.14.4)
    ('mass-hatched-11', 'mass', 11, None),
    ('mass-hatched-529', 'mass', 529, None),
]
GROUND = """async () => {
  for (let i = 0; i < 400; i++) {
    const g = window.__proun && window.__proun.groundMotion;
    if (!g || (g.pos === 0 && g.level === 0)) return true;
    await new Promise(r => setTimeout(r, 250));
  }
  return false;
}"""

async def settle(page, max_s=150):
    # the ground settles asymptotically and software GL is slow: wait until three canvases in a row, 1.5 s apart, are identical
    await page.evaluate(GROUND)
    last, same = None, 0
    for _ in range(int(max_s / 1.5)):
        cur = await grab(page)
        same = same + 1 if cur == last else 0
        if same >= 2: return cur
        last = cur; await page.wait_for_timeout(1500)
    raise RuntimeError('the picture never settled')

async def shoot(only):
    # EVERY scene gets a fresh page: the app's seeded random streams (paint grain, ground) advance with what was drawn before, so a
    # still shot after other scenes is not the still shot alone. With a fresh page each, a scene is the same whichever others run (--only).
    out = {}
    async with async_playwright() as pw:
        for k, (name, strategy, seed, mode) in enumerate(SCENES):
            if only and name not in only: continue
            b, page = await new_page(pw, URL, init=INIT)
            got = await page.evaluate("async ([s, seed]) => { const { toneModeFor } = await import('/src/texture/tone.js'); return toneModeFor(seed, s); }", [strategy, seed])
            if got != mode: raise SystemExit(f'{name}: seed {seed} now gets the {got} mode, not {mode}: the mode mix changed; pick new seeds')
            await page.evaluate("async (p) => { const { SceneConfig } = await import('/src/config/store.js'); SceneConfig.update(p); }",
                                {'composition': {'strategy': strategy}, 'orientation': 'landscape', 'seed': seed})
            # a dev server that has seen edits can serve store.js under a second URL (?t=...): the update would then go to a copy the app
            # does not use and the still would be the default scene. Refuse rather than shoot (and baseline) the wrong picture.
            urls = await page.evaluate("[...new Set(performance.getEntriesByType('resource').map(r => r.name).filter(n => /\\/config\\/store\\.js/.test(n)))]")
            if len(urls) != 1: raise SystemExit(f'the dev server serves store.js under {len(urls)} URLs ({urls}): restart it, its modules are stale')
            out[name] = Image.open(io.BytesIO(await settle(page))).convert('RGB')
            print(f'  shot {name} ({mode}) {out[name].size[0]}x{out[name].size[1]}', flush=True)
            await b.close()
    return out

def main():
    args = sys.argv[1:]
    update = '--update' in args
    only = {args[i + 1] for i, a in enumerate(args) if a == '--only' and i + 1 < len(args)}
    unknown = only - {s[0] for s in SCENES}
    if unknown: raise SystemExit(f'unknown scene(s): {sorted(unknown)}')
    shots = asyncio.run(shoot(only))
    if update:
        os.makedirs(BASE, exist_ok=True)
        for name, im in shots.items(): im.save(os.path.join(BASE, name + '.png'), optimize=True)
        manifest = os.path.join(BASE, 'manifest.json')
        old = json.load(open(manifest)) if os.path.exists(manifest) else {}
        old.update({n: {'strategy': s, 'seed': seed, 'mode': m, 'size': list(shots[n].size)} for n, s, seed, m in SCENES if n in shots})
        json.dump(old, open(manifest, 'w'), indent=2)
        print(f'baselines written to {BASE}'); return
    failed = []
    for name, im in shots.items():
        path = os.path.join(BASE, name + '.png')
        if not os.path.exists(path): print(f'FAIL {name}: no baseline (run with --update)'); failed.append(name); continue
        ref = Image.open(path).convert('RGB')
        if ref.size != im.size: print(f'FAIL {name}: size {im.size} vs baseline {ref.size}'); failed.append(name); continue
        a, r = np.asarray(im).astype(int), np.asarray(ref).astype(int)
        d = np.abs(a - r).max(axis=2)
        bad = d > TOL
        over = float(bad.mean())
        h, w = (bad.shape[0] // BLOCK) * BLOCK, (bad.shape[1] // BLOCK) * BLOCK
        worst = float(bad[:h, :w].reshape(h // BLOCK, BLOCK, w // BLOCK, BLOCK).mean(axis=(1, 3)).max())
        ok = over <= MAX_OVER and worst <= BLOCK_MAX
        print(f"{'ok  ' if ok else 'FAIL'} {name}: {100 * over:.3f}% of pixels differ by more than {TOL}, worst {BLOCK}px tile {100 * worst:.1f}%  (mean abs {np.abs(a - r).mean():.3f}, max {d.max()})")
        if not ok:
            failed.append(name)
            heat = np.zeros_like(a, dtype=np.uint8); heat[..., 0] = np.clip(d * 4, 0, 255); heat[..., 1] = heat[..., 0] // 3
            side = Image.new('RGB', (im.size[0] * 3, im.size[1]))
            side.paste(ref, (0, 0)); side.paste(im, (im.size[0], 0)); side.paste(Image.fromarray(heat), (im.size[0] * 2, 0))
            p = os.path.join(OUT, f'guard_diff_{name}.png'); side.save(p); print(f'     baseline | now | difference -> {p}')
    if failed: print(f'{len(failed)} of {len(shots)} scenes differ: {failed}'); sys.exit(1)
    print(f'all {len(shots)} scenes match the baselines')

main()
