# Palette gallery: every palette on the same composition (one seed per strategy), so palettes can be compared by eye under the real renderer
# (tones, shadow planes, highlights, paper). Needs the app served (APP_URL). One strategy per run (about 4 minutes in software GL):
#   APP_URL=http://localhost:5201/ STRATEGY=axis-thrust SEED=159 OUT=/tmp/palettes_axis.png python3 tools/verify/palette_sheet.py
#   PAL_FROM / PAL_TO select a slice of the palette list (default all).
import asyncio, io, os, sys
sys.path.insert(0, os.path.dirname(__file__))
from PIL import Image, ImageDraw
from playwright.async_api import async_playwright
from shoot import new_page, grab
URL = os.environ.get('APP_URL', 'http://localhost:5201/'); STRATEGY = os.environ.get('STRATEGY', 'axis-thrust'); SEED = int(os.environ.get('SEED', '159'))
OUT = os.environ.get('OUT', '/tmp/palettes.png'); A, B = int(os.environ.get('PAL_FROM', '0')), int(os.environ.get('PAL_TO', '99'))
async def settle(page):
    last, same = None, 0
    for _ in range(60):
        cur = await grab(page); same = same + 1 if cur == last else 0
        if same >= 2: return cur
        last = cur; await page.wait_for_timeout(1000)
    return last
async def main():
    async with async_playwright() as pw:
        b, page = await new_page(pw, URL, init='window.__proun = {};')
        await page.evaluate("async () => { const { SceneConfig } = await import('/src/config/store.js'); SceneConfig.update({ time: { durationMs: 300 } }); window.__proun.Lab && window.__proun.Lab.set('groundOn', false); }")
        names = await page.evaluate("async () => { const { palettes } = await import('/src/palette/palettes.js'); return Object.keys(palettes); }")
        tiles = []
        for name in names[A:B]:
            await page.evaluate("async (p) => { const { SceneConfig } = await import('/src/config/store.js'); SceneConfig.update(p); }",
                                {'palette': name, 'composition': {'strategy': STRATEGY}, 'orientation': 'landscape', 'seed': SEED})
            await page.wait_for_timeout(600)
            tiles.append((name, Image.open(io.BytesIO(await settle(page))).convert('RGB'))); print('  ', name, flush=True)
        await b.close()
    w, h = tiles[0][1].size; sc = 0.5; tw, th = int(w * sc), int(h * sc); cols = 3; rows = (len(tiles) + cols - 1) // cols
    sheet = Image.new('RGB', (tw * cols, (th + 16) * rows), 'white'); d = ImageDraw.Draw(sheet)
    for i, (name, im) in enumerate(tiles):
        x, y = (i % cols) * tw, (i // cols) * (th + 16); sheet.paste(im.resize((tw, th), Image.LANCZOS), (x, y + 16)); d.text((x + 4, y + 3), f'{STRATEGY} {SEED}: {name}', fill='black')
    sheet.save(OUT); print('->', OUT, sheet.size)
asyncio.run(main())
