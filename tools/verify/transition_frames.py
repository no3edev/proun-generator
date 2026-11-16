# TRANSITION FRAMES (v0.14.7): the real, un-held frames right after a composition change: the time each frame took and how much the
# picture changed from the one before (mean absolute difference): a one-frame pop shows as a spike at frame 1. Saves a sheet of the first five frames.
# NEW_URL-style: python3 tools/verify/transition_frames.py <url> <strategy> <seedA> <seedB> <out.png>   (software GL frames are slow: compare builds, not absolute numbers)
import asyncio, sys, io, base64
import os; sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from playwright.async_api import async_playwright
from shoot import new_page, grab
import numpy as np
from PIL import Image
URL=sys.argv[1]; STRAT=sys.argv[2]; A=int(sys.argv[3]); B=int(sys.argv[4]); OUT=sys.argv[5]
async def settle(page):
    last=None; same=0
    for _ in range(70):
        cur=await grab(page); same= same+1 if cur==last else 0
        if same>=2: return cur
        last=cur; await page.wait_for_timeout(1500)
CAP="""async ([s,seed]) => { const {SceneConfig}=await import('/src/config/store.js'); const c=document.getElementById('scene'); const out=[];
  SceneConfig.update({composition:{strategy:s},orientation:'landscape',seed});
  await new Promise(res=>{ let n=0; const f=()=>{ out.push([performance.now(), c.toDataURL('image/jpeg',0.92)]); if(++n<20) requestAnimationFrame(f); else res(); }; requestAnimationFrame(f); });
  return out; }"""
async def main():
    async with async_playwright() as pw:
        b,page=await new_page(pw,URL,init='window.__proun = {};')
        up="async ([s,seed])=>{const {SceneConfig}=await import('/src/config/store.js');SceneConfig.update({composition:{strategy:s},orientation:'landscape',seed});}"
        await page.evaluate(up,[STRAT,A]); await settle(page)
        rows=await page.evaluate(CAP,[STRAT,B])
        fr=[np.asarray(Image.open(io.BytesIO(base64.b64decode(u.split(',')[1]))).convert('RGB')).astype(int) for _,u in rows]
        ts=[t for t,_ in rows]
        sheet=np.hstack([fr[i][::2,::2] for i in (0,1,2,3,4)]).astype(np.uint8)
        Image.fromarray(sheet).save(OUT)
        print('frame: ms-since-prev, mean abs diff vs previous frame')
        for i in range(1,len(fr)): print(i, int(ts[i]-ts[i-1]), round(float(np.abs(fr[i]-fr[i-1]).mean()),2))
        await b.close()
asyncio.run(main())
