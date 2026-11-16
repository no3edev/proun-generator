# Renders the best seeds of the preset search next to the reference, one contact sheet per target: [reference | rank 1 | rank 2 | ...].
#   APP_URL=http://localhost:5201/ IDS=cracked-grey,grey-cube RANKS=2 python3 tools/presets/render_candidates.py   -> /tmp/cand_<id>.png
import asyncio, io, json, os, sys
sys.path.insert(0, os.path.join(os.path.dirname(__file__), '..', 'verify'))
from PIL import Image, ImageDraw
from playwright.async_api import async_playwright
from shoot import new_page, grab
URL = os.environ.get('APP_URL', 'http://localhost:5201/'); IDS = os.environ.get('IDS'); RANKS = int(os.environ.get('RANKS', '2')); SKIP = int(os.environ.get('SKIP', '0'))
SPECS = {s['id']: s for s in json.load(open('/tmp/presets_specs.json'))}; RES = json.load(open(os.environ.get('RES_FILE', '/tmp/presets_search.json')))
TARGETS = json.load(open(os.path.join(os.path.dirname(__file__), 'targets.json')))
def ref_image(name):
    f = TARGETS[name]['file']
    for d in ('/mnt/project/', '/mnt/user-data/uploads/'):
        if os.path.exists(d + f): return Image.open(d + f).convert('RGB')
async def settle(page):
    last, same = None, 0
    for _ in range(70):
        cur = await grab(page); same = same + 1 if cur == last else 0
        if same >= 2: return cur
        last = cur; await page.wait_for_timeout(900)
    return last
async def main():
    ids = IDS.split(',') if IDS else list(SPECS)
    async with async_playwright() as pw:
        for pid in ids:
            spec = SPECS[pid]; tiles = [('reference', ref_image(spec.get('target', pid)))]
            for cand in RES[pid][SKIP:SKIP + RANKS]:
                b, page = await new_page(pw, URL, init='window.__proun = {};')
                types = await page.evaluate("async () => (await import('/src/shapes/registry.js')).shapeRegistry.map(s => s.type)")
                patch = {'palette': spec['palette'], 'orientation': spec['orientation'], 'composition': {'strategy': spec['strategy']}, 'seed': cand['seed'], 'time': {'durationMs': 300},
                         'shapes': {t: {'count': spec['counts'].get(t, 0), 'visible': True, **({'spread': cand['v']['spread'], 'sizeMin': cand['v']['size'], 'sizeMax': cand['v']['size'], 'snapRotation': cand['v']['snap']} if cand.get('v') and t in spec['counts'] else {}), **spec.get('perType', {}).get(t, {})} for t in types}}
                await page.evaluate("async () => { window.__proun.Lab && window.__proun.Lab.set('groundOn', false); }")
                await page.evaluate("async (p) => { const { SceneConfig } = await import('/src/config/store.js'); SceneConfig.update(p); }", patch)
                v = cand.get('v'); tag = f" sp{v['spread']} sz{v['size']}{' snap' if v['snap'] else ''}" if v else ''
                tiles.append((f"seed {cand['seed']}{tag}  score {cand['score']}", Image.open(io.BytesIO(await settle(page))).convert('RGB'))); await b.close()
                print('  ', pid, cand['seed'], flush=True)
            H = 380; sheet_w = sum(int(im.size[0] * H / im.size[1]) for _, im in tiles)
            sheet = Image.new('RGB', (sheet_w, H + 16), 'white'); d = ImageDraw.Draw(sheet); x = 0
            for label, im in tiles:
                w = int(im.size[0] * H / im.size[1]); sheet.paste(im.resize((w, H), Image.LANCZOS), (x, 16)); d.text((x + 4, 3), f'{pid}: {label}', fill='black'); x += w
            sheet.save(f'/tmp/cand_{pid}.png')
asyncio.run(main())
