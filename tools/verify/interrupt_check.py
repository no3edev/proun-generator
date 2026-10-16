# A change that interrupts another: how much do shape pixels jump in the next frame (needs a build with the pause/scrub hook).
# See tools/verify/README.md. Needs: python3, playwright (+ chromium), numpy, pillow, scipy.
import asyncio, io
import numpy as np
from PIL import Image
from shoot import *
import os
URLS={'OLD':os.environ.get('BASE_URL','http://localhost:8103/'),'NEW':os.environ.get('NEW_URL','http://localhost:8104/')}
P1='Kestner Portfolio — flat primary'; P2='Proun — classic'
async def frame(page): return np.asarray(Image.open(io.BytesIO(await grab(page))).convert('RGB'),dtype=np.int16)
async def setl(page, **kw):
    await page.evaluate("(()=>{const L=window.__proun.Lab;"+"".join(f"L.set('{k}',{str(v).lower() if isinstance(v,bool) else v});" for k,v in kw.items())+"})()")
async def run(pw,name,h1):
    b,page=await new_page(pw,URLS[name]+'?dev'); await setl(page,groundOn=False,holdOn=True,hold=0.0005)
    await page.select_option('#palette-select',P1); await page.wait_for_timeout(400)
    await setl(page,hold=h1); await page.wait_for_timeout(900); A=await frame(page)
    # one synchronous step: freeze the new change at its start and trigger it, so no frame can run in between
    await page.evaluate("""(p)=>{ window.__proun.Lab.set('hold',0.0005); const s=document.getElementById('palette-select'); s.value=p; s.dispatchEvent(new Event('change',{bubbles:true})); }""",P2)
    await page.wait_for_timeout(900); B=await frame(page)
    await b.close()
    bgA=np.median(A.reshape(-1,3),axis=0); bgB=np.median(B.reshape(-1,3),axis=0)
    m=(np.abs(A-bgA).max(axis=2)>25)&(np.abs(B-bgB).max(axis=2)>25); d=np.abs(A-B)[m]
    print(f'{name}: 2nd change at {h1}: {int(m.sum())} shape px | mean change {d.mean():.2f}/255 | {100*np.mean(d.max(axis=1)>25):.1f}% changed by >25')
async def main():
    async with async_playwright() as pw:
        b,pg=await new_page(pw,URLS['NEW']+'?dev'); await pg.wait_for_timeout(2000); await b.close()
        for h in (0.4,0.45,0.65):
            for n in ('OLD','NEW'): await run(pw,n,h)
asyncio.run(main())
