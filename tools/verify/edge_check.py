# EDGE CHECK (v0.14.2, stage 5.2a): the edge character of box-like faces.
#   - legacy compositions: the canvas is the same as a build without the edge code (OLD_URL), pixel for pixel
#   - a strategy composition: edge on vs off in the same build; the difference is confined to the band around box faces
#   - stills (1x full frame, 4x crop) saved to OUT for a look
# OLD_URL=http://localhost:5202/ NEW_URL=http://localhost:5201/ OUT=/tmp python3 tools/verify/edge_check.py <strategy> <seed>
import asyncio, os, sys, io
sys.path.insert(0, os.path.dirname(__file__))
from playwright.async_api import async_playwright
from shoot import new_page, grab
import numpy as np
from PIL import Image
OLD, NEW, OUT = os.environ.get('OLD_URL'), os.environ['NEW_URL'], os.environ.get('OUT', '/tmp')  # no OLD_URL: the legacy comparison is skipped
STRAT, SEED = sys.argv[1], int(sys.argv[2])
async def settle(page, max_s=120):
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
        shots = {}
        for name, url in ([('old', OLD), ('new', NEW)] if OLD else []):
            b, page = await new_page(pw, url, init='window.__proun = {};')
            await scene(page, 'legacy', 3)
            shots[name] = await settle(page)
            await b.close()
        if OLD:
            d = np.abs(arr(shots['old']) - arr(shots['new'])).max(axis=2)
            print(f'legacy seed 3, old vs new canvas: identical {100 * (d == 0).mean():.3f}%, max difference {d.max()}')
        b, page = await new_page(pw, NEW, init='window.__proun = {};')
        errors = []
        page.on('console', lambda m: errors.append(m.text[:300]) if ('Shader Error' in m.text or m.type == 'error' and 'ERR_NAME' not in m.text) else None)
        page.on('pageerror', lambda e: errors.append(str(e)[:300]))
        await scene(page, STRAT, SEED)
        on = await settle(page)
        await page.evaluate("window.__proun.Lab.set('edgeOn', false)"); off = await settle(page)
        diff = np.abs(arr(on) - arr(off)).max(axis=2)
        print(f'{STRAT} {SEED}: pixels changed by the edge band: {100 * (diff > 0).mean():.2f}% ({100 * (diff > 3).mean():.2f}% by more than 3 levels), max {diff.max()}')
        Image.fromarray(np.hstack([arr(off), arr(on)]).astype(np.uint8)).save(f'{OUT}/edge_{STRAT}_{SEED}_1x_off_on.png')
        print('shader / page errors:', len(errors), errors[:2])
        e_off = await export4(page)
        await page.evaluate("window.__proun.Lab.set('edgeOn', true)"); await page.wait_for_timeout(2500)
        e_on = await export4(page)
        await b.close()
    a, c = np.asarray(e_off).astype(int), np.asarray(e_on).astype(int)
    dd = np.abs(a - c).max(axis=2); ys, xs = np.nonzero(dd > 6)
    if len(ys):
        cy, cx = int(np.median(ys)), int(np.median(xs)); h, w = a.shape[:2]
        y0, x0 = max(0, min(h - 360, cy - 180)), max(0, min(w - 480, cx - 240))
        cw, ch = 480, 360
        if os.environ.get('CROP'):  # x,y,w,h in the 4x export's pixels
            x0, y0, cw, ch = (int(v) for v in os.environ['CROP'].split(','))
        crop = np.hstack([a[y0:y0 + ch, x0:x0 + cw], c[y0:y0 + ch, x0:x0 + cw]]).astype(np.uint8)
        Image.fromarray(crop).save(f'{OUT}/edge_{STRAT}_{SEED}_4x_crop_off_on.png'); print('4x crop saved at', (x0, y0))
    print(f'4x export {e_on.size}: pixels changed {100 * (dd > 0).mean():.2f}%')
asyncio.run(main())
