# STAGE 5.0 LAYER AUDIT: what each material layer contributes on a real render (not part of the app or npm test).
#   python3 tools/verify/layer_audit.py <strategy> <seed>      (needs the dev server: NEW_URL, default http://localhost:5201/)
# Renders one scene settled, then with the ground off, the procedural paint off, both off, and composes the DOM paper overlay the way
# the PNG exporter does. Paper pixels = pixels that change when the ground is switched off; shape pixels = the rest.
import asyncio, os, sys, io, json
sys.path.insert(0, os.path.dirname(__file__))
from playwright.async_api import async_playwright
from shoot import new_page, grab
import numpy as np
from PIL import Image
URL = os.environ.get('NEW_URL', 'http://localhost:5201/')
OUT = os.environ.get('AUDIT_OUT', '/tmp')
async def settle(page, max_s=120):
    last, same = None, 0
    for _ in range(int(max_s / 1.5)):
        cur = await grab(page)
        same = same + 1 if cur == last else 0
        if same >= 2: return cur
        last = cur; await page.wait_for_timeout(1500)
    raise RuntimeError('never settled')
def img(b): return np.asarray(Image.open(io.BytesIO(b)).convert('RGB')).astype(float)
def lum(a): return a @ np.array([0.2126, 0.7152, 0.0722])
async def main(strategy, seed):
    async with async_playwright() as pw:
        b, page = await new_page(pw, URL, init='window.__proun = {};')
        await page.evaluate("async ([s, seed]) => { const { SceneConfig } = await import('/src/config/store.js'); SceneConfig.update({ composition: { strategy: s }, orientation: 'landscape', seed }); }", [strategy, seed])
        full = await settle(page)
        # the overlay composed as PngExporter does (multiply, opacity 0.5)
        comp = await page.evaluate("""async () => {
          const { SceneManager } = await import('/src/core/SceneManager.js');
          const src = document.getElementById('scene'); if (!SceneManager.getOverlayCanvas) return null; const ov = SceneManager.getOverlayCanvas();
          const c = document.createElement('canvas'); c.width = src.width; c.height = src.height; const x = c.getContext('2d');
          x.drawImage(src, 0, 0); x.globalCompositeOperation = 'multiply'; x.globalAlpha = SceneManager.getOverlayOpacity(); x.drawImage(ov, 0, 0, c.width, c.height);
          return c.toDataURL('image/png'); }""")
        import base64
        comp = base64.b64decode(comp.split(',')[1]) if comp else full  # builds from v0.14.0 on have no DOM overlay
        res = {}
        for name, patch in [('ground_off', {'groundOn': False}), ('paint_off', {'paintOn': False}), ('both_off', {'groundOn': False, 'paintOn': False})]:
            await page.evaluate("async (p) => { const { Lab } = await import('/src/lab/Lab.js'); for (const k in p) Lab.set(k, p[k]); }", patch)
            res[name] = await settle(page)
            await page.evaluate("async (p) => { const { Lab } = await import('/src/lab/Lab.js'); for (const k in p) Lab.set(k, true); }", patch)
        await b.close()
    F, C, G, P, B = img(full), img(comp), img(res['ground_off']), img(res['paint_off']), img(res['both_off'])
    from scipy.ndimage import binary_erosion
    # with the ground off the paper is one flat colour: its most common pixel value marks every paper pixel exactly
    vals, cnt = np.unique(G.reshape(-1, 3), axis=0, return_counts=True)
    paper0 = (G == vals[cnt.argmax()]).all(axis=2)
    # erode both masks 4 px so antialiased edge pixels (a blend of both) do not pollute the statistics
    paper = binary_erosion(paper0, iterations=4)
    shape = binary_erosion(~paper0, iterations=4)
    print(f'{strategy} seed {seed}: paper {100*paper.mean():.1f}% of pixels, shapes {100*shape.mean():.1f}% (after erosion)')
    def stat(a, m): v = lum(a)[m]; return v.mean(), v.std(), v.std() / max(v.mean(), 1e-6)
    for nm, a, m in [('paper, full', F, paper), ('paper, ground off (flat paper)', G, paper), ('paper + DOM overlay', C, paper), ('shapes, full', F, shape), ('shapes, paint off', P, shape), ('shapes + DOM overlay', C, shape)]:
        mu, sd, cv = stat(a, m); print(f'  {nm:34s} mean lum {mu:6.1f}  std {sd:5.2f}  std/mean {cv:.4f}')
    d = (C - F)[shape].mean(axis=0); print(f'  overlay shifts shape pixels by mean RGB {d.round(1).tolist()} ; paper pixels by {(C - F)[paper].mean(axis=0).round(1).tolist()}')
    # darkest shape pixels (the ink): how far from palette black does the overlay lift or tint them
    dark = shape & (lum(F) < 60)
    if dark.any(): print(f'  darkest shapes: full {F[dark].mean(axis=0).round(1).tolist()} -> with overlay {C[dark].mean(axis=0).round(1).tolist()}')
    Image.fromarray(np.hstack([F, C]).astype(np.uint8)).save(os.path.join(OUT, f'audit_{strategy}_{seed}_screen_vs_export.png'))
asyncio.run(main(sys.argv[1], int(sys.argv[2])))
