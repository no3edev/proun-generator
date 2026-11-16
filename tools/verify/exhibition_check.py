"""Stage 7 acceptance check: everything an exhibition display relies on, in one run, against the real app.

    APP_URL=http://localhost:5173/ python3 tools/verify/exhibition_check.py

Prints PASS / FAIL per check and exits 1 if any failed. On a GPU it takes a minute or two; in software WebGL (SwiftShader, the
sandbox's) several minutes, because every settled picture takes seconds. It needs the page to expose `window.__proun`
(src/lab/Lab.js does) and drives it with the page's own modules, so use the dev server or a build served from a static server.
"""
import asyncio, base64, io, json, os, sys, time
sys.path.insert(0, os.path.dirname(__file__))
from playwright.async_api import async_playwright
import numpy as np
from PIL import Image
import shoot
from shoot import grab

BASE = os.environ.get('APP_URL', 'http://localhost:5173/')
UP = "async (p)=>{const {SceneConfig}=await import('/src/config/store.js');SceneConfig.update(p);}"
GET = "async ()=>{const {SceneConfig}=await import('/src/config/store.js');const c=SceneConfig.get();return {seed:c.seed,palette:c.palette,orientation:c.orientation,time:c.time};}"
RECT = """()=>{const r=document.getElementById('stage-wrap').getBoundingClientRect();return {x:Math.round(r.x),y:Math.round(r.y),w:Math.round(r.width),h:Math.round(r.height),vw:innerWidth,vh:innerHeight,
 panel:getComputedStyle(document.getElementById('panel')).display,bg:getComputedStyle(document.body).backgroundColor,cursor:getComputedStyle(document.getElementById('scene')).cursor,cls:document.body.className}}"""
RESULTS = []
# SECTIONS=hide,flags,context,recovery,curated,export runs only those (default: all)
WANT = {x for x in os.environ.get('SECTIONS', '').split(',') if x}
def wanted(name): return not WANT or name in WANT

def check(name, ok, detail=''):
    RESULTS.append((name, bool(ok), detail))
    print(('PASS  ' if ok else 'FAIL  ') + name + (f'   [{detail}]' if detail else ''), flush=True)

async def settle(page):
    last = None; same = 0
    for _ in range(60):
        cur = await grab(page); same = same + 1 if cur == last else 0
        if same >= 2: return cur
        last = cur; await page.wait_for_timeout(1000)
    return cur

def arr(b): return np.asarray(Image.open(io.BytesIO(b)).convert('RGB')).astype(int)
def pct(a, b, tol=6): return float((np.abs(arr(a) - arr(b)).max(axis=2) > tol).mean() * 100)

async def newpage(b, url, w=1280, h=800, dpr=1):
    ctx = await b.new_context(viewport={'width': w, 'height': h}, device_scale_factor=dpr)
    await ctx.route('**/fonts.googleapis.com/**', lambda r: r.abort())
    p = await ctx.new_page(); await p.add_init_script(shoot.STUB); await p.add_init_script('window.__proun = {};')
    errs = []; p.on('pageerror', lambda e: errs.append(str(e)))
    await p.goto(url); await p.wait_for_selector('#scene'); await p.wait_for_timeout(1500)
    return ctx, p, errs

async def main():
    async with async_playwright() as pw:
        b = await pw.chromium.launch(args=shoot.ARGS)

        # --- 1. the interface can be hidden without disrupting playback
        if wanted('hide'):
            ctx, p, errs = await newpage(b, BASE)
            r0 = await p.evaluate(RECT)
            await p.keyboard.press('KeyF'); await p.wait_for_timeout(1200)
            r = await p.evaluate(RECT)
            check('F hides the interface and fills the window on black', 'exhibition' in r['cls'] and r['panel'] == 'none' and r['bg'] == 'rgb(0, 0, 0)' and (r['w'] == r['vw'] or r['h'] == r['vh']), f"{r['w']}x{r['h']} in {r['vw']}x{r['vh']}")
            s0 = (await p.evaluate(GET))['seed']
            await p.mouse.click(640, 400); await p.wait_for_timeout(1200)
            check('a click on the picture does not advance it', (await p.evaluate(GET))['seed'] == s0)
            await p.keyboard.press('Space'); await p.wait_for_timeout(1500)
            check('Space still advances', (await p.evaluate(GET))['seed'] != s0)
            await p.evaluate(UP, {'time': {'durationMs': 300, 'holdMs': 700, 'autoAdvance': True}})
            await p.evaluate("async()=>{const {SceneConfig}=await import('/src/config/store.js');window.__adv=0;SceneConfig.subscribe((n,pv)=>{if(n.seed!==pv.seed)window.__adv++});}")
            for _ in range(40):
                await p.wait_for_timeout(1000)
                if await p.evaluate("()=>window.__adv") >= 3: break
            check('Auto keeps changing the picture while the interface is hidden', await p.evaluate("()=>window.__adv") >= 3)
            await p.evaluate(UP, {'time': {'autoAdvance': False}})
            await p.mouse.move(100, 100); await p.wait_for_timeout(2700)
            idle = await p.evaluate(RECT)
            await p.mouse.move(200, 200); await p.wait_for_timeout(300)
            check('the cursor hides when idle and returns on movement', idle['cursor'] == 'none' and (await p.evaluate(RECT))['cursor'] != 'none')
            await p.keyboard.press('Escape'); await p.wait_for_timeout(1200)
            e = await p.evaluate(RECT)
            check('Esc brings the interface back at the normal size', 'exhibition' not in e['cls'] and e['panel'] != 'none' and [e['w'], e['h']] == [r0['w'], r0['h']])
            check('no page errors (hide / show)', not errs, '; '.join(errs[:2]))
            await ctx.close()

        # --- 2. start flags
        if wanted('flags'):
            for q, want in (('?exhibition', (True, False, False)), ('?exhibition&auto&playlist', (True, True, True)), ('?exhibition=0', (False, False, False))):
                ctx, p, errs = await newpage(b, BASE + q)
                c = await p.evaluate(GET); cls = (await p.evaluate(RECT))['cls']
                got = ('exhibition' in cls, c['time']['autoAdvance'], c['time']['playlist'])
                exh = c['time']['durationMs'] == 60000 and c['time']['holdMs'] == 900000
                check(f'start flag {q}', got == want and (exh == want[1]), f'mode/auto/playlist {got}, exhibition timing {exh}')
                await ctx.close()

        # --- 3. WebGL context loss
        if wanted('context'):
            ctx, p, errs = await newpage(b, BASE + '?exhibition')
            before = await settle(p)
            for _ in range(3):
                await p.evaluate("()=>{const e=window.__proun.getRenderer().getContext().getExtension('WEBGL_lose_context'); window.__e=e; e.loseContext();}"); await p.wait_for_timeout(800)
                await p.evaluate("()=>window.__e.restoreContext()"); await p.wait_for_timeout(2500)
            d = pct(before, await settle(p))
            st = await p.evaluate("()=>window.__proun.contextStats()")
            check('three lost WebGL contexts come back as the same picture, paper included', d < 0.05 and st['losses'] == 3 and st['restores'] == 3, f'{d:.3f}% differ, {st}')
            await ctx.close()

        # --- 4. unattended recovery
        if wanted('recovery'):
            ctx, p, errs = await newpage(b, BASE + '?exhibition')
            await p.evaluate(UP, {'seed': 31337, 'time': {'durationMs': 60000, 'holdMs': 900000, 'autoAdvance': True}}); await p.wait_for_timeout(1200)
            navs = []; p.on('framenavigated', lambda f: navs.append(1) if f == p.main_frame else None)
            await p.evaluate("()=>{window.__m=1; for(let i=0;i<20;i++) window.dispatchEvent(new ErrorEvent('error',{message:'t'+i}));}")
            try:
                await p.wait_for_function("()=>window.__m === undefined", timeout=15000); await p.wait_for_selector('#scene'); await p.wait_for_timeout(2500)
                c = await p.evaluate(GET)
                check('a storm of 20 errors reloads the page and the session comes back', c['seed'] == 31337 and c['time']['holdMs'] == 900000 and c['time']['autoAdvance'] and 'exhibition' in (await p.evaluate(RECT))['cls'], f"seed {c['seed']}")
                await p.evaluate("()=>{window.__m=2; for(let i=0;i<20;i++) window.dispatchEvent(new ErrorEvent('error',{message:'t'+i}));}"); await p.wait_for_timeout(3500)
                check('a second storm within 5 minutes does not reload again', await p.evaluate("()=>window.__m === 2"))
            except Exception as ex:
                check('a storm of 20 errors reloads the page and the session comes back', False, str(ex)[:100])
            await ctx.close()
            ctx, p, errs = await newpage(b, BASE)
            await p.evaluate("()=>{window.__m=3; for(let i=0;i<30;i++) window.dispatchEvent(new ErrorEvent('error',{message:'t'}));}"); await p.wait_for_timeout(3000)
            check('the same storm in normal mode (someone editing) does nothing', await p.evaluate("()=>window.__m === 3"))
            await ctx.close()

        # --- 5. the curated sequence and the background fade
        if wanted('curated'):
            ctx, p, errs = await newpage(b, BASE)
            await p.evaluate("()=>{const c=document.getElementById('playlist-toggle'); c.checked=true; c.dispatchEvent(new Event('change'));}")
            await p.evaluate("async()=>{const {SceneConfig}=await import('/src/config/store.js');SceneConfig.update({time:{durationMs:300,holdMs:700,autoAdvance:true}});window.__seeds=[];SceneConfig.subscribe((n,pv)=>{if(n.seed!==pv.seed)window.__seeds.push(n.seed)});}")
            for _ in range(60):
                await p.wait_for_timeout(1000)
                if await p.evaluate("()=>window.__seeds.length") >= 4: break
            seeds = await p.evaluate("()=>window.__seeds")
            lib = await p.evaluate("async()=>{const m=await import('/src/presets/library.js');return m.LIBRARY.map(x=>x.config.seed)}")
            g = await p.evaluate(GET)
            check('the curated sequence shows Library presets, none twice in a row, at the display\'s orientation, with the display\'s timing',
                  len(seeds) >= 4 and all(s in lib for s in seeds) and all(seeds[i] != seeds[i - 1] for i in range(1, len(seeds))) and g['orientation'] == 'landscape' and g['time']['durationMs'] == 300,
                  f'{len(seeds)} changes')
            await p.evaluate("async()=>{const {SceneConfig}=await import('/src/config/store.js');SceneConfig.update({time:{autoAdvance:false,playlist:false,durationMs:20000}})}")
            await settle(p)
            pal = await p.evaluate("async()=>{const m=await import('/src/palette/palettes.js');return Object.fromEntries(Object.entries(m.palettes).map(([k,v])=>[k,v.paper]))}")
            lum = lambda h: sum(int(h.lstrip('#')[i:i + 2], 16) * w for i, w in ((0, .2126), (2, .7152), (4, .0722)))
            names = sorted(pal, key=lambda n: lum(pal[n]))
            await p.evaluate(UP, {'palette': names[-1]}); await settle(p)
            await p.evaluate("()=>{window.__proun.Lab.set('holdOn', true); window.__proun.Lab.set('hold', 0.0001);}")
            await p.evaluate(UP, {'palette': names[0]})
            def corner(bts): a = arr(bts); return float(np.median([a[:30, :30].mean(), a[:30, -30:].mean(), a[-30:, :30].mean(), a[-30:, -30:].mean()]))
            vals = []
            for h in (0.0001, 0.5, 1.0):
                await p.evaluate("(h)=>window.__proun.Lab.set('hold', h)", h); vals.append(corner(await settle(p)))
            check('a palette change fades the paper over the window instead of cutting (start, middle, end all different, monotonic)', vals[0] > vals[1] > vals[2] + 1, f'{[round(v, 1) for v in vals]}')
            await p.evaluate("()=>window.__proun.Lab.set('holdOn', false)")
            await ctx.close()

        # --- 6. exported images match the composition
        if wanted('export'):
            ctx, p, errs = await newpage(b, BASE)
            await p.evaluate(UP, {'seed': 4242, 'composition': {'strategy': 'axis-thrust'}})
            screen = await settle(p)
            async def export(scale=None, size=None):
                await p.evaluate("(a)=>{const s=document.getElementById('export-scale'); s.value=a.scale; s.dispatchEvent(new Event('change')); if(a.size) document.getElementById('export-size').value=a.size;}", {'scale': scale or 'custom', 'size': size})
                async with p.expect_download(timeout=600000) as dl:
                    await p.evaluate("()=>document.getElementById('export-png-btn').click()")
                d = await dl.value; path = f'/tmp/exh_export_{scale or size}.png'; await d.save_as(path)
                return path, d.suggested_filename, await p.evaluate("()=>document.getElementById('export-png-btn').textContent")
            path, name, text = await export(scale='1')
            im = Image.open(path).convert('RGB')
            check('a 1x export is the picture on screen', list(im.size) == list(Image.open(io.BytesIO(screen)).size) and pct(screen, open(path, 'rb').read()) < 0.01, f'{im.size}, {pct(screen, open(path, "rb").read()):.4f}% differ')
            path, name, text = await export(size='3000')
            im = Image.open(path).convert('RGB')
            check('Custom size 3000 is a single pass, 3000 px on the long side, named with it', max(im.size) == 3000 and 'tiled' not in text and name.endswith('@3000px.png'), f'{im.size} {name} "{text}"')
            small = np.asarray(im.resize(Image.open(io.BytesIO(screen)).size, Image.LANCZOS)).astype(int)
            check('and it matches the screen when scaled down', float((np.abs(small - arr(screen)).max(axis=2) > 24).mean() * 100) < 1.0)
            res = await p.evaluate("""async () => {
              const { SceneManager } = await import('/src/core/SceneManager.js'); const { composeExport } = await import('/src/export/PngExporter.js');
              const base = SceneManager.getRenderer().domElement; const w = base.width * 2, h = base.height * 2;
              const single = SceneManager.renderScaled(2, (c) => composeExport({ source: c })); const tiled = SceneManager.renderTiled(w, h, 400);
              return { w, h, a: single.toDataURL('image/png'), b: tiled.toDataURL('image/png') }; }""")
            da = np.asarray(Image.open(io.BytesIO(base64.b64decode(res['a'].split(',')[1]))).convert('RGB')).astype(int)
            db = np.asarray(Image.open(io.BytesIO(base64.b64decode(res['b'].split(',')[1]))).convert('RGB')).astype(int)
            diff = float((np.abs(da - db).max(axis=2) > 6).mean() * 100)
            check('a tiled render equals a single-pass render of the same size (12 tiles at 2x)', diff < 0.05, f'{diff:.4f}% of pixels differ')
            check('the exports left the picture on screen untouched', pct(screen, await settle(p)) < 0.01)
            check('no page errors (export)', not errs, '; '.join(errs[:2]))
            await ctx.close()

        await b.close()

    failed = [n for n, ok, _ in RESULTS if not ok]
    print(f'\n{len(RESULTS) - len(failed)} of {len(RESULTS)} checks passed' + (f'; FAILED: {failed}' if failed else ''))
    sys.exit(1 if failed else 0)

asyncio.run(main())
