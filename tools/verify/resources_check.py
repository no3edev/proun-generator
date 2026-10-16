# Resource leaks over many changes (renderer.info, JS heap) and relative frame cost of the effects.
# See tools/verify/README.md. Needs: python3, playwright (+ chromium), numpy, pillow, scipy.
import asyncio
import numpy as np
from shoot import *
import os
URL=os.environ.get('APP_URL','http://localhost:8104/')
async def setl(page, **kw):
    await page.evaluate("(()=>{const L=window.__proun.Lab;"+"".join(f"L.set('{k}',{str(v).lower() if isinstance(v,bool) else v});" for k,v in kw.items())+"})()")
INFO="""()=>{ const r=window.__proun.getRenderer(); const i=r.info; if (window.gc) window.gc(); 
  return JSON.stringify({geometries:i.memory.geometries, textures:i.memory.textures, programs:(i.programs||[]).length, heapMB: performance.memory? +(performance.memory.usedJSHeapSize/1048576).toFixed(1):null}); }"""
FRAMES="""async (n)=>{ const t=[]; let last=performance.now(); await new Promise(res=>{ const f=()=>{ const now=performance.now(); t.push(now-last); last=now; if(t.length>n) res(); else requestAnimationFrame(f);}; requestAnimationFrame(f);}); t.shift(); t.sort((a,b)=>a-b); return t[Math.floor(t.length/2)]; }"""
async def main():
    async with async_playwright() as pw:
        b = await pw.chromium.launch(args=ARGS+['--js-flags=--expose-gc','--enable-precise-memory-info'])
        ctx = await b.new_context(viewport={'width':1280,'height':800}); await ctx.route('**/fonts.googleapis.com/**', lambda r: r.abort())
        page = await ctx.new_page(); await page.goto(URL); await page.wait_for_selector('#scene'); await page.wait_for_timeout(2000)
        print('after load       :', await page.evaluate(INFO))
        for _ in range(3): await page.click('#advance-btn'); await page.wait_for_timeout(1500)
        await page.wait_for_timeout(6000); print('after 3 changes  :', await page.evaluate(INFO))
        for _ in range(40): await page.click('#advance-btn'); await page.wait_for_timeout(500)
        await page.wait_for_timeout(9000); print('after 43 changes :', await page.evaluate(INFO))
        # changing shape counts / visibility exercises create + dispose
        await page.click('#tabbtn-shapes'); await page.wait_for_timeout(300)
        for _ in range(6): await page.click('#advance-btn'); await page.wait_for_timeout(400)
        await page.wait_for_timeout(6000); print('after more changes:', await page.evaluate(INFO))
        # relative frame cost at rest (software GL: only ratios mean anything)
        await page.wait_for_timeout(3000)
        for name,kw in [('everything on (defaults)',{}),('ground off',{'groundOn':False}),('legacy paint pattern, ground off',{'groundOn':False,'paintOn':False})]:
            await setl(page,**kw); await page.wait_for_timeout(1500); ms=await page.evaluate(FRAMES,25); print(f'median frame at rest, {name}: {ms:.0f} ms')
        await b.close()
asyncio.run(main())
