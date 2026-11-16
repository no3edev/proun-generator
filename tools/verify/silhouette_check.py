# SILHOUETTE CHECK (v0.14.5, stage 5.3): the soft, irregular outline of boxes and extrusions (alpha to coverage on the multisampled canvas).
#   - legacy compositions: the canvas is the same as a build without the silhouette code (OLD_URL; skipped without it), pixel for pixel
#   - a strategy: the silhouette on vs off in one build (the Lab's softness and irregularity at 0): share of pixels changed, shader errors
#   - stills: the 1x frame, and a 4x crop where the most changed
# OLD_URL=http://localhost:5202/ NEW_URL=http://localhost:5201/ OUT=/tmp python3 tools/verify/silhouette_check.py <strategy> <seed> [<seed> ...]
import asyncio, os, sys, io
sys.path.insert(0, os.path.dirname(__file__))
from playwright.async_api import async_playwright
from shoot import new_page, grab
import numpy as np
from PIL import Image
OLD, NEW, OUT = os.environ.get('OLD_URL'), os.environ['NEW_URL'], os.environ.get('OUT', '/tmp')
STRAT, SEEDS = sys.argv[1], [int(s) for s in sys.argv[2:]]
async def settle(page, max_s=100):
    last, same = None, 0
    for _ in range(int(max_s / 1.5)):
        cur = await grab(page); same = same + 1 if cur == last else 0
        if same >= 2: return cur
        last = cur; await page.wait_for_timeout(1500)
    raise RuntimeError('never settled')
def arr(b): return np.asarray(Image.open(io.BytesIO(b)).convert('RGB')).astype(int)
async def scene(page, strategy, seed):
    await page.evaluate("async ([s, seed]) => { const { SceneConfig } = await import('/src/config/store.js'); SceneConfig.update({ composition: { strategy: s }, orientation: 'landscape', seed }); }", [strategy, seed])
async def export4(page):
    await page.select_option('#export-scale', '4')
    async with page.expect_download(timeout=90000) as d:
        await page.click('#export-png-btn')
    return Image.open(await (await d.value).path()).convert('RGB')
async def main():
    async with async_playwright() as pw:
        if OLD:
            shots = {}
            for name, url in [('old', OLD), ('new', NEW)]:
                b, page = await new_page(pw, url, init='window.__proun = {};')
                await scene(page, 'legacy', 3); shots[name] = await settle(page); await b.close()
            d = np.abs(arr(shots['old']) - arr(shots['new'])).max(axis=2)
            print(f'legacy seed 3, old vs new canvas: identical {100 * (d == 0).mean():.3f}%, max difference {d.max()}')
        for seed in SEEDS:
            b, page = await new_page(pw, NEW, init='window.__proun = {};')
            errors = []
            page.on('console', lambda m: errors.append(m.text[:300]) if ('Shader Error' in m.text or m.type == 'error' and 'ERR_NAME' not in m.text) else None)
            page.on('pageerror', lambda e: errors.append(str(e)[:300]))
            await scene(page, STRAT, seed)
            on = await settle(page)
            await page.evaluate("window.__proun.Lab.set('edgeSoft', 0); window.__proun.Lab.set('edgeIrr', 0)"); off = await settle(page)
            diff = np.abs(arr(on) - arr(off)).max(axis=2)
            print(f'{STRAT} {seed}: silhouette changes {100 * (diff > 0).mean():.2f}% of pixels ({100 * (diff > 6).mean():.2f}% by more than 6 levels, max {diff.max()}); errors {len(errors)} {errors[:1]}')
            Image.fromarray(np.hstack([arr(off), arr(on)]).astype(np.uint8)).save(f'{OUT}/sil_{STRAT}_{seed}_1x_off_on.png')
            e_off = await export4(page)
            await page.evaluate("window.__proun.Lab.set('edgeSoft', 0.008); window.__proun.Lab.set('edgeIrr', 0.006)"); await page.wait_for_timeout(2500)
            e_on = await export4(page)
            a, c = np.asarray(e_off).astype(int), np.asarray(e_on).astype(int)
            dd = np.abs(a - c).max(axis=2); T = 200
            tiles = [(int((dd[y:y + T, x:x + T] > 6).sum()), x, y) for y in range(0, a.shape[0] - T, T) for x in range(0, a.shape[1] - T, T)]
            n, x0, y0 = max(tiles)
            cw, ch = 560, 400
            x0, y0 = max(0, min(a.shape[1] - cw, x0 - (cw - T) // 2)), max(0, min(a.shape[0] - ch, y0 - (ch - T) // 2))
            Image.fromarray(np.hstack([a[y0:y0 + ch, x0:x0 + cw], c[y0:y0 + ch, x0:x0 + cw]]).astype(np.uint8)).save(f'{OUT}/sil_{STRAT}_{seed}_4x_crop_off_on.png')
            print(f'  4x export: {100 * (dd > 6).mean():.2f}% of pixels change by more than 6; crop at {(x0, y0)}')
            await b.close()
asyncio.run(main())
