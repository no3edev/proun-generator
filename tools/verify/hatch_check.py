# HATCH CHECK (v0.14.4, stage 5.2c): hatching on the Mass backdrop (when dark) and on about half the shadow planes.
# For each seed of a strategy: hatching on vs off in one build (share of pixels changed), shader / page errors, and for the seeds that
# change, a 1x pair and a 4x crop saved to OUT. NEW_URL=http://localhost:5201/ OUT=/tmp python3 tools/verify/hatch_check.py <strategy> <seed> [<seed> ...]
import asyncio, os, sys, io
sys.path.insert(0, os.path.dirname(__file__))
from playwright.async_api import async_playwright
from shoot import new_page, grab
import numpy as np
from PIL import Image
NEW, OUT = os.environ['NEW_URL'], os.environ.get('OUT', '/tmp')
STRAT, SEEDS = sys.argv[1], [int(s) for s in sys.argv[2:]]
async def settle(page, max_s=100):
    last, same = None, 0
    for _ in range(int(max_s / 1.5)):
        cur = await grab(page); same = same + 1 if cur == last else 0
        if same >= 2: return cur
        last = cur; await page.wait_for_timeout(1500)
    raise RuntimeError('never settled')
def arr(b): return np.asarray(Image.open(io.BytesIO(b)).convert('RGB')).astype(int)
async def export4(page):
    await page.select_option('#export-scale', '4')
    async with page.expect_download(timeout=90000) as d:
        await page.click('#export-png-btn')
    return Image.open(await (await d.value).path()).convert('RGB')
async def main():
    async with async_playwright() as pw:
        for seed in SEEDS:
            b, page = await new_page(pw, NEW, init='window.__proun = {};')
            errors = []
            page.on('console', lambda m: errors.append(m.text[:300]) if ('Shader Error' in m.text or m.type == 'error' and 'ERR_NAME' not in m.text) else None)
            page.on('pageerror', lambda e: errors.append(str(e)[:300]))
            await page.evaluate("async ([s, seed]) => { const { SceneConfig } = await import('/src/config/store.js'); SceneConfig.update({ composition: { strategy: s }, orientation: 'landscape', seed }); }", [STRAT, seed])
            on = await settle(page)
            await page.evaluate("window.__proun.Lab.set('hatchOn', false)"); off = await settle(page)
            diff = np.abs(arr(on) - arr(off)).max(axis=2)
            print(f'{STRAT} {seed}: hatching changes {100 * (diff > 0).mean():.2f}% of pixels ({100 * (diff > 3).mean():.2f}% by more than 3 levels, max {diff.max()}); errors {len(errors)} {errors[:1]}')
            if (diff > 3).mean() > 0.002 or os.environ.get('FORCE'):
                Image.fromarray(np.hstack([arr(off), arr(on)]).astype(np.uint8)).save(f'{OUT}/hatch_{STRAT}_{seed}_1x_off_on.png')
                e_off = await export4(page)
                await page.evaluate("window.__proun.Lab.set('hatchOn', true)"); await page.wait_for_timeout(2500)
                e_on = await export4(page)
                a, c = np.asarray(e_off).astype(int), np.asarray(e_on).astype(int)
                dd = np.abs(a - c).max(axis=2); ys, xs = np.nonzero(dd > 6)
                if len(ys):
                    cy, cx = int(np.median(ys)), int(np.median(xs)); h, w = a.shape[:2]
                    cw, ch = 640, 440
                    y0, x0 = max(0, min(h - ch, cy - ch // 2)), max(0, min(w - cw, cx - cw // 2))
                    Image.fromarray(np.hstack([a[y0:y0 + ch, x0:x0 + cw], c[y0:y0 + ch, x0:x0 + cw]]).astype(np.uint8)).save(f'{OUT}/hatch_{STRAT}_{seed}_4x_crop_off_on.png')
            await b.close()
asyncio.run(main())
