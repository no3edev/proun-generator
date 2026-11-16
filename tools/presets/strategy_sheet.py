# A contact sheet of one strategy over several seeds under the real renderer (ground off for speed).
#   APP_URL=http://localhost:5201/ STRATEGY=tower SEEDS=1,2,3,4,5,6 ORIENT=portrait PALETTE='Proun — lithograph on cream' OUT=/tmp/strategy_tower.png python3 tools/presets/strategy_sheet.py
import asyncio, io, os, sys
sys.path.insert(0, os.path.join(os.path.dirname(__file__), '..', 'verify'))
from PIL import Image, ImageDraw
from playwright.async_api import async_playwright
from shoot import new_page, grab
URL = os.environ.get('APP_URL', 'http://localhost:5201/'); STRATEGY = os.environ.get('STRATEGY', 'tower'); ORIENT = os.environ.get('ORIENT', 'portrait')
SEEDS = [int(s) for s in os.environ.get('SEEDS', '1,2,3,4,5,6').split(',')]; PALETTE = os.environ.get('PALETTE', 'Proun — classic'); OUT = os.environ.get('OUT', '/tmp/strategy.png')
COLS = int(os.environ.get('COLS', '3'))
async def settle(page):
    last, same = None, 0
    for _ in range(60):
        cur = await grab(page); same = same + 1 if cur == last else 0
        if same >= 2: return cur
        last = cur; await page.wait_for_timeout(900)
    return last
async def main():
    tiles = []
    async with async_playwright() as pw:
        for seed in SEEDS:
            b, page = await new_page(pw, URL, init='window.__proun = {};')
            await page.evaluate("async () => { window.__proun.Lab && window.__proun.Lab.set('groundOn', false); }")
            await page.evaluate("async (p) => { const { SceneConfig } = await import('/src/config/store.js'); SceneConfig.update(p); }",
                                {'palette': PALETTE, 'orientation': ORIENT, 'composition': {'strategy': STRATEGY}, 'seed': seed, 'time': {'durationMs': 300}})
            tiles.append((seed, Image.open(io.BytesIO(await settle(page))).convert('RGB'))); await b.close(); print('  ', seed, flush=True)
    H = 330; ims = [(s, im.resize((int(im.size[0] * H / im.size[1]), H), Image.LANCZOS)) for s, im in tiles]
    rows = [ims[i:i + COLS] for i in range(0, len(ims), COLS)]; W = max(sum(im.size[0] for _, im in r) for r in rows)
    sheet = Image.new('RGB', (W, len(rows) * (H + 14)), 'white'); d = ImageDraw.Draw(sheet)
    for ri, r in enumerate(rows):
        x = 0
        for s, im in r: sheet.paste(im, (x, ri * (H + 14) + 14)); d.text((x + 3, ri * (H + 14) + 2), f'{STRATEGY} {s}', fill='black'); x += im.size[0]
    sheet.save(OUT); print('->', OUT, sheet.size)
asyncio.run(main())
