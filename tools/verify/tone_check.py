# Stage 4.1 check in a real (software-GL) browser:
#  1. LEGACY IDENTITY: the legacy generator renders pixel-identically to a baseline build (BASE_URL) at rest, after a seed change.
#  2. CONTACT SHEET: one scene per (strategy, tonal mode), NEW_URL, saved to OUT (default /tmp/tone_sheet.png).
#  3. RIDING THE FRONT: a change from a faceted scene to a subtle one, sampled at several moments: no frame jumps in mean luminance
#     of the shapes' pixels beyond what the geometry and colour change cause (reported, not asserted).
# Usage: BASE_URL=http://localhost:5202/ NEW_URL=http://localhost:5201/ python3 tools/verify/tone_check.py
import asyncio, os, io, sys
sys.path.insert(0, os.path.dirname(__file__))
from playwright.async_api import async_playwright
from shoot import new_page, grab
import numpy as np
from PIL import Image, ImageDraw

BASE = os.environ.get('BASE_URL'); NEW = os.environ.get('NEW_URL', 'http://localhost:5201/')
OUT = os.environ.get('OUT', '/tmp/tone_sheet.png')
INIT = 'window.__proun = {};'
STRATEGIES = ['axis-thrust', 'disc-beams', 'central-cluster']
MODES = ['faceted', 'subtle', 'pale']

SETTLE = """async () => {
  for (let i = 0; i < 400; i++) {
    const g = window.__proun && window.__proun.groundMotion;
    if (!g || (g.pos === 0 && g.level === 0)) { await new Promise(r => setTimeout(r, 400)); const g2 = window.__proun.groundMotion; if (!g2 || (g2.pos === 0 && g2.level === 0)) return true; }
    await new Promise(r => setTimeout(r, 250));
  }
  return false;
}"""
async def settle(page, max_s=120):
    # the ground settles asymptotically and transitions are slow in software GL (the frame step is clamped), so wait until the
    # picture stops changing: three identical canvases in a row, a second and a half apart
    await page.evaluate(SETTLE)
    last, same = None, 0
    for _ in range(int(max_s / 1.5)):
        cur = await grab(page)
        same = same + 1 if cur == last else 0
        if same >= 2: return True
        last = cur; await page.wait_for_timeout(1500)
    return False
async def update(page, patch):
    await page.evaluate("async (p) => { const { SceneConfig } = await import('/src/config/store.js'); SceneConfig.update(p); }", patch)
async def img(page): return Image.open(io.BytesIO(await grab(page))).convert('RGB')

async def legacy_identity(pw):
    if not BASE: print('legacy identity: BASE_URL not set, skipped'); return
    res = []
    for url in (BASE, NEW):
        b, page = await new_page(pw, url, init=INIT)
        await update(page, {'composition': {'strategy': 'legacy'}, 'seed': 4242}); await settle(page)
        a = await img(page)
        await update(page, {'seed': 99}); await settle(page)
        c = await img(page)
        res.append((np.asarray(a).astype(int), np.asarray(c).astype(int))); await b.close()
    for k, name in enumerate(['rest (seed 4242)', 'after a seed change (seed 99)']):
        d = np.abs(res[0][k] - res[1][k]); print(f'legacy {name}: max diff {d.max()}, pixels differing {(d.sum(axis=2) > 0).sum()}')

async def find_seeds(page):
    return await page.evaluate("""async ({ S, M }) => {
      const { toneModeFor } = await import('/src/texture/tone.js');
      const out = {};
      for (const s of S) for (const m of M) { for (let seed = 11; seed < 5000; seed += 37) if (toneModeFor(seed, s) === m) { out[s + '/' + m] = seed; break; } }
      return out; }""", {'S': STRATEGIES, 'M': MODES})

async def sheet(pw):
    b, page = await new_page(pw, NEW, init=INIT)
    seeds = await find_seeds(page)
    tiles = []
    for s in STRATEGIES:
        for m in MODES:
            await update(page, {'composition': {'strategy': s}, 'orientation': 'landscape', 'seed': seeds[f'{s}/{m}']}); await settle(page)
            tiles.append((f'{s} / {m}  (seed {seeds[f"{s}/{m}"]})', await img(page)))
    await b.close()
    w, h = tiles[0][1].size; sc = 0.5; tw, th = int(w * sc), int(h * sc)
    sheet = Image.new('RGB', (tw * 3, (th + 18) * 3), 'white')
    for i, (label, im) in enumerate(tiles):
        x, y = (i % 3) * tw, (i // 3) * (th + 18)
        sheet.paste(im.resize((tw, th), Image.LANCZOS), (x, y + 18)); ImageDraw.Draw(sheet).text((x + 4, y + 3), label, fill='black')
    sheet.save(OUT); print('contact sheet ->', OUT, sheet.size)

CUBES_ONLY = {t: {'count': 0} for t in ['beam', 'rod', 'segment', 'crescent', 'frame', 'ring', 'triangle', 'sphere']}
async def cube_sheet(pw):
    # the modes on the solids that carry them: cubes and planks only (+ the disc), larger tiles
    out = OUT.replace('.png', '_cubes.png')
    b, page = await new_page(pw, NEW, init=INIT)
    seeds = await find_seeds(page)
    tiles = []
    for s in ['central-cluster', 'axis-thrust']:
        for m in MODES:
            await update(page, {'composition': {'strategy': s}, 'orientation': 'landscape', 'shapes': CUBES_ONLY, 'seed': seeds[f'{s}/{m}']}); await settle(page)
            tiles.append((f'{s} / {m}  (seed {seeds[f"{s}/{m}"]})', await img(page)))
    await b.close()
    w, h = tiles[0][1].size; sc = 0.6; tw, th = int(w * sc), int(h * sc)
    sheet = Image.new('RGB', (tw * 3, (th + 18) * 2), 'white')
    for i, (label, im) in enumerate(tiles):
        x, y = (i % 3) * tw, (i // 3) * (th + 18)
        sheet.paste(im.resize((tw, th), Image.LANCZOS), (x, y + 18)); ImageDraw.Draw(sheet).text((x + 4, y + 3), label, fill='black')
    sheet.save(out); print('cube sheet ->', out, sheet.size)

async def full(pw):
    # one scene of each strategy at full size (shadow planes are small: look closely)
    b, page = await new_page(pw, NEW, init=INIT)
    seeds = await find_seeds(page)
    for s in STRATEGIES:
        m = 'subtle' if s != 'central-cluster' else 'faceted'
        await update(page, {'composition': {'strategy': s}, 'orientation': 'landscape', 'seed': seeds[f'{s}/{m}']}); await settle(page)
        out = OUT.replace('.png', f'_full_{s}.png'); (await img(page)).save(out); print('full ->', out)
    await b.close()

async def ride_front(pw):
    b, page = await new_page(pw, NEW, init=INIT)
    seeds = await find_seeds(page)
    s = 'axis-thrust'
    await update(page, {'composition': {'strategy': s}, 'seed': seeds[f'{s}/faceted']}); await settle(page)
    before = await img(page)
    await page.evaluate("() => { window.__proun.Rhythm && 0; }")
    await update(page, {'seed': seeds[f'{s}/subtle']})
    frames = []
    for i in range(12):
        frames.append(await img(page)); await page.wait_for_timeout(350)
    await settle(page); after = await img(page)
    lum = lambda im: float(np.asarray(im.convert('L')).mean())
    ls = [lum(before)] + [lum(f) for f in frames] + [lum(after)]
    print('mean luminance of the picture, faceted -> subtle:', ' '.join(f'{x:.1f}' for x in ls))
    steps = [abs(ls[i + 1] - ls[i]) for i in range(len(ls) - 1)]; print('largest step between frames: %.2f / 255' % max(steps))
    await b.close()

async def main():
    async with async_playwright() as pw:
        steps = os.environ.get('STEPS', 'legacy,sheet,cubes,front').split(',')
        if 'legacy' in steps: await legacy_identity(pw)
        if 'sheet' in steps: await sheet(pw)
        if 'full' in steps: await full(pw)
        if 'cubes' in steps: await cube_sheet(pw)
        if 'front' in steps: await ride_front(pw)
asyncio.run(main())
