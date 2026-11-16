# GROUND CACHE CHECK (v0.14.1): a build with the ground cached in a render target (NEW_URL) against one that draws the ground shader
# every frame (OLD_URL; for v0.14.1 that is v0.14.0, which also has no DOM overlay):
#   - the settled canvas is the same, pixel for pixel (at most ONE_OFF levels of difference allowed per channel)
#   - the canvas of a scene paused mid-change (ground mid-morph, lab pause-and-scrub) is the same
#   - at rest the new build draws the ground shader 0 times over many frames; during a morph it draws every frame
#   - the same after a lab edit (the ground redraws once for the edit) and after switching the ground off and on
#   - frame cost at rest, both builds (software GL: only the ratio means anything)
# OLD_URL=http://localhost:5202/ NEW_URL=http://localhost:5201/ python3 tools/verify/ground_cache_check.py
import asyncio, os, sys, io
sys.path.insert(0, os.path.dirname(__file__))
from playwright.async_api import async_playwright
from shoot import new_page, grab
import numpy as np
from PIL import Image
OLD, NEW = os.environ['OLD_URL'], os.environ['NEW_URL']
STRAT, SEED = 'axis-thrust', 11
async def settle(page, max_s=120):
    last, same = None, 0
    for _ in range(int(max_s / 1.5)):
        cur = await grab(page); same = same + 1 if cur == last else 0
        if same >= 2: return cur
        last = cur; await page.wait_for_timeout(1500)
    raise RuntimeError('never settled')
def arr(b): return np.asarray(Image.open(io.BytesIO(b)).convert('RGB')).astype(int)
def cmp(a, b, label):
    d = np.abs(arr(a) - arr(b)).max(axis=2)
    print(f'  {label}: identical pixels {100 * (d == 0).mean():.3f}%, max level difference {d.max()}, over 1 level: {100 * (d > 1).mean():.4f}%')
    return int(d.max())
async def frame_ms(page, n=20):
    return await page.evaluate("""async (n) => { let t = performance.now(); let k = 0; const ts = [];
      await new Promise(r => { const f = () => { ts.push(performance.now()); if (++k > n) r(); else requestAnimationFrame(f); }; requestAnimationFrame(f); });
      const d = ts.slice(1).map((x, i) => x - ts[i]).sort((a, b) => a - b); return d[Math.floor(d.length / 2)]; }""", n)
async def setup(pw, url):
    b, page = await new_page(pw, url, init='window.__proun = {};')
    await page.evaluate("async ([s, seed]) => { const { SceneConfig } = await import('/src/config/store.js'); SceneConfig.update({ composition: { strategy: s }, orientation: 'landscape', seed }); }", [STRAT, SEED])
    return b, page
async def draws(page): return await page.evaluate("window.__proun.groundCacheStats ? window.__proun.groundCacheStats.draws : null")
async def main():
    worst = 0
    async with async_playwright() as pw:
        res = {}
        for name, url in [('old', OLD), ('new', NEW)]:
            b, page = await setup(pw, url)
            r = {}
            r['rest'] = await settle(page)
            r['ms_rest'] = await frame_ms(page)
            if name == 'new':
                d0 = await draws(page); await page.wait_for_timeout(3000); d1 = await draws(page)
                r['rest_draws'] = (d0, d1)
                # a lab edit: one redraw for it (then none)
                await page.evaluate("window.__proun.Lab.set('groundVis', 0.04)"); await page.wait_for_timeout(2500)
                d2 = await draws(page); await page.wait_for_timeout(2500); d3 = await draws(page)
                r['edit_draws'] = (d1, d2, d3)
                await page.evaluate("window.__proun.Lab.set('groundVis', 0.022)"); await page.wait_for_timeout(2500)
                r['off_on_before'] = await settle(page)
                await page.evaluate("window.__proun.Lab.set('groundOn', false)"); await page.wait_for_timeout(1500)
                await page.evaluate("window.__proun.Lab.set('groundOn', true)"); await page.wait_for_timeout(2500)
                r['off_on_after'] = await settle(page)
            # paused mid-change: advance the seed, hold the clock at 1.0 durations after the change
            await page.evaluate("async (seed) => { const { SceneConfig } = await import('/src/config/store.js'); SceneConfig.update({ seed }); }", SEED + 1)
            await page.wait_for_timeout(300)
            await page.evaluate("window.__proun.Lab.set('holdOn', true); window.__proun.Lab.set('hold', 1.0)")
            r['mid'] = await settle(page)
            if name == 'new':
                m0 = await draws(page); await page.wait_for_timeout(2000); r['held_draws'] = (m0, await draws(page))
            await b.close(); res[name] = r
    print('canvas identity, old vs new:')
    worst = max(worst, cmp(res['old']['rest'], res['new']['rest'], 'settled at rest'))
    worst = max(worst, cmp(res['old']['mid'], res['new']['mid'], 'paused mid-change (hold 1.0)'))
    worst = max(worst, cmp(res['new']['off_on_before'], res['new']['off_on_after'], 'new build: ground off then on = before'))
    print(f"draws of the ground shader at rest over ~3 s: {res['new']['rest_draws'][0]} -> {res['new']['rest_draws'][1]} (want equal)")
    print(f"after one lab edit: {res['new']['edit_draws']} (want: +small, then equal)")
    print(f"held mid-morph (paused): {res['new']['held_draws']} (the clock is frozen, nothing changes: want equal)")
    print(f"median frame interval at rest, software GL: old {res['old']['ms_rest']:.0f} ms, new {res['new']['ms_rest']:.0f} ms")
    sys.exit(1 if worst > 1 else 0)
asyncio.run(main())
