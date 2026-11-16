# Regeneration glitch scan. For a few regenerations (the real advance button) per strategy it freezes the change at slider ~0 with the Lab's pause
# slider and compares it with the picture just before the change, looking only at pixels that are shape in BOTH (shapes that leave or arrive
# are not a pop): where the same shapes sit still at the start of a change they must look identical. A texture or colour that jumps at the moment of
# regeneration shows as a large difference there. Needs the app served (APP_URL); about 1 minute per regeneration in software GL.
#   APP_URL=http://localhost:5201/ STRATEGIES=axis-thrust,disc-beams REGENS=2 python3 tools/verify/glitch_scan.py
import asyncio, io, os, sys
sys.path.insert(0, os.path.dirname(__file__))
import numpy as np
from PIL import Image
from playwright.async_api import async_playwright
from shoot import new_page, grab
URL = os.environ.get('APP_URL', 'http://localhost:5201/'); OUT = os.environ.get('OUT', '/tmp/glitch')
STRATEGIES = os.environ.get('STRATEGIES', 'axis-thrust').split(','); REGENS = int(os.environ.get('REGENS', '2'))
async def lab(page, **kw): await page.evaluate("(()=>{const L=window.__proun.Lab;" + "".join(f"L.set('{k}',{str(v).lower() if isinstance(v, bool) else v});" for k, v in kw.items()) + "})()")
async def cfg(page, p): await page.evaluate("async (p) => { const { SceneConfig } = await import('/src/config/store.js'); SceneConfig.update(p); }", p)
async def frame(page): return Image.open(io.BytesIO(await grab(page))).convert('RGB')
async def settle(page):
    last, same = None, 0
    for _ in range(80):
        cur = await grab(page); same = same + 1 if cur == last else 0
        if same >= 2: return
        last = cur; await page.wait_for_timeout(1200)
def metric(before, start):
    a, b = np.asarray(before, dtype=np.int16), np.asarray(start, dtype=np.int16)
    paper = np.median(a.reshape(-1, 3), axis=0)
    shape = lambda x: np.abs(x - paper).max(axis=2) > 28
    both = shape(a) & shape(b)
    d = np.abs(a - b).max(axis=2)
    return int(both.sum()), (float(d[both].mean()) if both.any() else 0.0), int((d[both] > 12).sum())
async def main():
    async with async_playwright() as pw:
        for strategy in STRATEGIES:
            b, page = await new_page(pw, URL, init='window.__proun = {};')
            await lab(page, groundOn=False)
            await cfg(page, {'composition': {'strategy': strategy}, 'orientation': 'landscape', 'seed': 11}); await settle(page)
            for k in range(REGENS):
                rest0 = await frame(page)
                await page.click('#advance-btn'); await page.wait_for_timeout(1500); await settle(page)
                await lab(page, holdOn=True, hold=0.0005); await page.wait_for_timeout(900)
                start = await frame(page)
                n, mean, big = metric(rest0, start)
                print(f'{strategy} regeneration {k + 1}: shape pixels in both {n}, mean abs diff {mean:.2f}, pixels differing by more than 12: {big} ({100 * big / max(n, 1):.1f}%)', flush=True)
                Image.fromarray(np.concatenate([np.asarray(rest0), np.asarray(start)], axis=1)).save(f'{OUT}_{strategy}_{k + 1}.png')
                await lab(page, holdOn=False); await page.wait_for_timeout(1200); await settle(page)
            await b.close()
asyncio.run(main())
