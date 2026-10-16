# Reproducibility: advance 3x, take the share link, open it in a differently-seeded session, compare pixels.
# See tools/verify/README.md. Needs: python3, playwright (+ chromium), numpy, pillow, scipy.
import asyncio, io, re
import numpy as np
from PIL import Image
from shoot import *
import os
URL=os.environ.get('APP_URL','http://localhost:8104/')
STUB2 = STUB.replace('0x9e3779b9','0x1badc0de').replace('c = 12345','c = 99999')   # a different "browser": other Math.random / crypto sequences
async def page_with(pw, stub, url, perms=True):
    b = await pw.chromium.launch(args=ARGS)
    ctx = await b.new_context(viewport={'width':1280,'height':800}, permissions=['clipboard-read','clipboard-write'] if perms else [])
    await ctx.route('**/fonts.googleapis.com/**', lambda r: r.abort())
    page = await ctx.new_page(); await page.add_init_script(stub); await page.goto(url); await page.wait_for_selector('#scene'); await page.wait_for_timeout(1200)
    return b, page
async def canvas(page): return np.asarray(Image.open(io.BytesIO(await grab(page))).convert('RGB'),dtype=np.int16)
async def stage(page): return np.asarray(Image.open(io.BytesIO(await page.locator('#paper-overlay').screenshot())).convert('RGB'),dtype=np.int16)
def diff(a,b): return int((np.abs(a-b).max(axis=2)>0).sum())
async def main():
    async with async_playwright() as pw:
        # page A: reach a state by advancing three times, take its share link
        b,A=await page_with(pw,STUB,URL)
        for _ in range(3):
            await A.click('#advance-btn'); await A.wait_for_timeout(5200)
        for _ in range(60):
            st=await A.evaluate('JSON.stringify({p:window.__proun.groundMotion.pos,l:window.__proun.groundMotion.level})')
            if st=='{"p":0,"l":0}': break
            await A.wait_for_timeout(500)
        await A.evaluate("window.__proun.Lab.set('holdOn',false)")
        await A.click('#copy-link-btn') if await A.query_selector('#copy-link-btn') else await A.click('text=Copy link')
        await A.wait_for_timeout(500)
        link=await A.evaluate("navigator.clipboard.readText()")
        print('share link:', link[:70]+'...')
        print('A ground at rest?', await A.evaluate('JSON.stringify({pos:window.__proun.groundMotion.pos, level:window.__proun.groundMotion.level, shifts:window.__proun.groundMotion.shifts})'))
        a_canvas=await canvas(A); a_stage=await stage(A); Image.fromarray(a_canvas.astype('uint8')).save('repro_A.png'); await b.close()
        # page B: a different browser session (other Math.random / crypto streams) opens the link
        b,B=await page_with(pw,STUB2,link)
        await B.wait_for_timeout(1500)
        b_canvas=await canvas(B); b_stage=await stage(B); Image.fromarray(b_canvas.astype('uint8')).save('repro_B.png'); await b.close()
        print(f'WebGL canvas, advanced 3x vs opened from the link: {diff(a_canvas,b_canvas)} px differ')
        print(f'composited stage (canvas + DOM paper grain):       {diff(a_stage,b_stage)} px differ')
asyncio.run(main())
