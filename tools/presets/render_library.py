# Loads each Library preset THROUGH THE PANEL (opens Presets, clicks the preset's Load button) and shoots it next to its reference:
#   APP_URL=http://localhost:5201/ FROM=0 TO=5 OUT=/tmp/library_a.png python3 tools/presets/render_library.py
# Also saves a screenshot of the opened Presets section (/tmp/library_panel.png) the first time.
import asyncio, io, json, os, re, sys
sys.path.insert(0, os.path.join(os.path.dirname(__file__), '..', 'verify'))
from PIL import Image, ImageDraw
from playwright.async_api import async_playwright
from shoot import new_page, grab
URL = os.environ.get('APP_URL', 'http://localhost:5201/'); A, B = int(os.environ.get('FROM', '0')), int(os.environ.get('TO', '99')); OUT = os.environ.get('OUT', '/tmp/library.png')
TARGETS = json.load(open(os.path.join(os.path.dirname(__file__), 'targets.json')))
def ref_image(name):
    f = TARGETS[name]['file']
    for d in ('/mnt/project/', '/mnt/user-data/uploads/'):
        if os.path.exists(d + f): return Image.open(d + f).convert('RGB')
async def settle(page):
    last, same = None, 0
    for _ in range(90):
        cur = await grab(page); same = same + 1 if cur == last else 0
        if same >= 2: return cur
        last = cur; await page.wait_for_timeout(1000)
    return last
async def main():
    entries = [(m.group(1), m.group(2)) for m in re.finditer(r'"ref": "([a-z0-9-]+)",\s+"name": "([^"]+)"', open(os.path.join(os.path.dirname(__file__), '..', '..', 'src', 'presets', 'library.js')).read())]
    tiles = []
    async with async_playwright() as pw:
        for i, (ref, name) in enumerate(entries):
            if not (A <= i < B): continue
            b, page = await new_page(pw, URL, init='window.__proun = {};')
            if os.environ.get('GROUND', '0') == '0': await page.evaluate("() => window.__proun.Lab && window.__proun.Lab.set('groundOn', false)")   # the ground's slow settling is not what is being checked
            await page.locator('#presets-section .accordion-header').first.click()    # the Presets section starts collapsed
            await page.wait_for_selector('.preset-library .preset-row', state='visible')
            rows = page.locator('.preset-library .preset-row'); assert await rows.count() == len(entries), 'the Library rows are not in the panel'
            if i == A and A == 0:
                await page.locator('.preset-library').screenshot(path='/tmp/library_panel.png')
            # a real DOM click on the Load button (Playwright's own 'stable' wait starves while software GL renders; hit-testing was checked separately)
            await rows.nth(i).locator('button').first.evaluate('b => b.click()')
            seed = await page.evaluate("async () => (await import('/src/config/store.js')).SceneConfig.get().seed")
            tiles.append((f'{name} (seed {seed})', ref_image(ref), Image.open(io.BytesIO(await settle(page))).convert('RGB'))); await b.close(); print('  ', name, seed, flush=True)
    H = 330; cols = []
    for label, ref, im in tiles:
        rw, iw = int(ref.size[0] * H / ref.size[1]), int(im.size[0] * H / im.size[1]); cols.append((label, ref.resize((rw, H), Image.LANCZOS), im.resize((iw, H), Image.LANCZOS)))
    per_row = 2; rows_n = (len(cols) + per_row - 1) // per_row; widths = [sum(c[1].size[0] + c[2].size[0] + 6 for c in cols[r * per_row:(r + 1) * per_row]) for r in range(rows_n)]
    sheet = Image.new('RGB', (max(widths), rows_n * (H + 16)), 'white'); d = ImageDraw.Draw(sheet)
    for r in range(rows_n):
        x = 0
        for label, ref, im in cols[r * per_row:(r + 1) * per_row]:
            y = r * (H + 16); d.text((x + 3, y + 2), label, fill='black'); sheet.paste(ref, (x, y + 16)); sheet.paste(im, (x + ref.size[0] + 3, y + 16)); x += ref.size[0] + im.size[0] + 6
    sheet.save(OUT); print('->', OUT, sheet.size)
asyncio.run(main())
