# FIRST FRAME CHECK (v0.14.8): the exact first frame of a composition change (the lab clock held at the very start) against the picture before it, and
# how many near-white pixels (all channels >= 251) each has: paper never reaches that, so a white wedge at the start of a change (a shadow plane
# drawn over its parent, found in v0.14.8) shows as a count that jumps from 0. python3 tools/verify/first_frame_check.py <url> <strategy> <A,B> [<A,B> ...]
# (the held first frame is timing-sensitive in software GL: trust the near-white counts, not the share of pixels that differ)
import asyncio, sys, io
import os; sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from playwright.async_api import async_playwright
from shoot import new_page, grab
import numpy as np
from PIL import Image
URL=sys.argv[1]; STRAT=sys.argv[2]; PAIRS=[tuple(int(x) for x in p.split(',')) for p in sys.argv[3:]]
def arr(b): return np.asarray(Image.open(io.BytesIO(b)).convert('RGB')).astype(int)
async def settle(page):
    last=None; same=0
    for _ in range(70):
        cur=await grab(page); same= same+1 if cur==last else 0
        if same>=2: return cur
        last=cur; await page.wait_for_timeout(1500)
async def main():
    async with async_playwright() as pw:
        b,page=await new_page(pw,URL,init='window.__proun = {};')
        up="async ([s,seed])=>{const {SceneConfig}=await import('/src/config/store.js');SceneConfig.update({composition:{strategy:s},orientation:'landscape',seed});}"
        await page.evaluate("()=>{window.__proun.Lab.set('holdOn', true); window.__proun.Lab.set('hold', 0.0001)}")
        cur=PAIRS[0][0]
        await page.evaluate("()=>window.__proun.Lab.set('hold', 1.0)")
        await page.evaluate(up,[STRAT,cur]); a=await settle(page)
        for (A,B) in PAIRS:
            if A!=cur:
                await page.evaluate("()=>window.__proun.Lab.set('hold', 1.0)"); await page.evaluate(up,[STRAT,A]); a=await settle(page); cur=A
            await page.evaluate("()=>window.__proun.Lab.set('hold', 0.0001)")
            await page.evaluate(up,[STRAT,B]); f=await settle(page); cur=B
            d=np.abs(arr(a)-arr(f)).max(axis=2)
            wa=int((arr(a).min(axis=2)>=251).sum()); wf=int((arr(f).min(axis=2)>=251).sum())
            print(f'   near-white pixels (all channels >=251): previous picture {wa}, first frame {wf}')
            print(f'{STRAT} {A}->{B}: first frame (p=0.0001) vs previous picture: {100*(d>6).mean():.2f}% of pixels differ by >6 levels, max {d.max()}')
            Image.fromarray(np.hstack([arr(a),arr(f),np.repeat(d[:,:,None].clip(0,255),3,axis=2)]).astype(np.uint8)).save(f'/tmp/p0_{STRAT}_{A}_{B}.png')
            await page.evaluate("()=>window.__proun.Lab.set('hold', 1.0)"); a=await settle(page)
        await b.close()
asyncio.run(main())
