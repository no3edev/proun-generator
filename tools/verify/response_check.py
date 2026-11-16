# RESPONSE CHECK (v0.14.6, stage 5.4): the materials' response to the event clock, and the fixed / evolve switch for surface patterns.
#   hold    a composition change with the clock held at the peak of the energy: the response on vs off (share of pixels changed), shader errors
#   evolve  with "Patterns evolve" on, a scene reached by a change from another seed is the same, pixel for pixel, as the same seed made
#           directly (the surface depends on the composition seed only); and it differs from the fixed surface
# NEW_URL=http://localhost:5201/ python3 tools/verify/response_check.py hold <strategy> <seedA> <seedB>
# NEW_URL=http://localhost:5201/ python3 tools/verify/response_check.py evolve <strategy> <seedA> <seedB>
import asyncio, os, sys, io
sys.path.insert(0, os.path.dirname(__file__))
from playwright.async_api import async_playwright
from shoot import new_page, grab
import numpy as np
from PIL import Image
NEW, OUT = os.environ['NEW_URL'], os.environ.get('OUT', '/tmp')
MODE, STRAT, A, B = sys.argv[1], sys.argv[2], int(sys.argv[3]), int(sys.argv[4])
async def settle(page, max_s=110):
    last, same = None, 0
    for _ in range(int(max_s / 1.5)):
        cur = await grab(page); same = same + 1 if cur == last else 0
        if same >= 2: return cur
        last = cur; await page.wait_for_timeout(1500)
    raise RuntimeError('never settled')
def arr(b): return np.asarray(Image.open(io.BytesIO(b)).convert('RGB')).astype(int)
async def scene(page, seed):
    await page.evaluate("async ([s, seed]) => { const { SceneConfig } = await import('/src/config/store.js'); SceneConfig.update({ composition: { strategy: s }, orientation: 'landscape', seed }); }", [STRAT, seed])
def watch(page):
    errors = []
    page.on('console', lambda m: errors.append(m.text[:300]) if ('Shader Error' in m.text or m.type == 'error' and 'ERR_NAME' not in m.text) else None)
    page.on('pageerror', lambda e: errors.append(str(e)[:300]))
    return errors
async def main():
    async with async_playwright() as pw:
        if MODE == 'hold':
            b, page = await new_page(pw, NEW, init='window.__proun = {};'); errors = watch(page)
            await scene(page, A); await settle(page)
            await page.evaluate("window.__proun.Lab.set('holdOn', true); window.__proun.Lab.set('hold', 0.35)")
            await scene(page, B); on = await settle(page)
            e = await page.evaluate("window.__proun.Rhythm.energy")
            await page.evaluate("window.__proun.Lab.set('respOn', false)"); off = await settle(page)
            diff = np.abs(arr(on) - arr(off)).max(axis=2)
            print(f'{STRAT} {A}->{B}, clock held at 0.35 durations (energy {e:.2f}): the response changes {100 * (diff > 0).mean():.2f}% of pixels ({100 * (diff > 6).mean():.2f}% by more than 6 levels, max {diff.max()}); errors {len(errors)} {errors[:1]}')
            Image.fromarray(np.hstack([arr(off), arr(on)]).astype(np.uint8)).save(f'{OUT}/resp_{STRAT}_{A}_{B}_hold_off_on.png')
            await b.close()
        else:
            res = {}
            for name, steps in [('via', [A, B]), ('direct', [B])]:
                b, page = await new_page(pw, NEW, init='window.__proun = {};'); errors = watch(page)
                await page.evaluate("window.__proun.Lab.set('surfEvolve', true)")
                for sd in steps:
                    await scene(page, sd); res[name] = await settle(page)
                print(name, 'errors', len(errors), errors[:1]); await b.close()
            b, page = await new_page(pw, NEW, init='window.__proun = {};')
            await scene(page, B); res['fixed'] = await settle(page); await b.close()
            d1 = np.abs(arr(res['via']) - arr(res['direct'])).max(axis=2)
            d2 = np.abs(arr(res['fixed']) - arr(res['direct'])).max(axis=2)
            print(f'evolve: {A}->{B} vs {B} directly: identical {100 * (d1 == 0).mean():.3f}%, max difference {d1.max()}')
            print(f'evolve vs fixed at {B}: {100 * (d2 > 0).mean():.2f}% of pixels differ ({100 * (d2 > 6).mean():.2f}% by more than 6 levels)')
            Image.fromarray(np.hstack([arr(res['fixed']), arr(res['direct'])]).astype(np.uint8)).save(f'{OUT}/evolve_{STRAT}_{B}_fixed_evolve.png')
asyncio.run(main())
