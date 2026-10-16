# Pause-and-scrub: slider 0 == before the change, 1.5 == after, release settles on the exact end state.
# See tools/verify/README.md. Needs: python3, playwright (+ chromium), numpy, pillow, scipy.
import asyncio, io
import numpy as np
from PIL import Image
from shoot import *
import os
URL=os.environ.get('APP_URL','http://localhost:8104/')
async def setl(page, **kw):
    await page.evaluate("(()=>{const L=window.__proun.Lab;"+"".join(f"L.set('{k}',{str(v).lower() if isinstance(v,bool) else v});" for k,v in kw.items())+"})()")
async def frame(page): return np.asarray(Image.open(io.BytesIO(await grab(page))).convert('RGB'),dtype=np.int16)
def diff(a,b): return int((np.abs(a-b).max(axis=2)>0).sum())
async def main():
    async with async_playwright() as pw:
        b,page=await new_page(pw,URL)
        await setl(page,groundOn=False)                      # canvas = shapes only
        await page.wait_for_timeout(900)                     # let a frame without the ground render first
        rest0=await frame(page)
        await page.click('#advance-btn'); await page.wait_for_timeout(5500)
        rest1=await frame(page)
        print('the change itself moved the scene:', diff(rest0,rest1),'px differ between before and after')
        # pause AFTER the change has finished: the slider must still scrub it
        await setl(page,holdOn=True,hold=0.0005); await page.wait_for_timeout(900); s0=await frame(page)
        mids=[]
        for h in (0.25,0.5,0.75):
            await setl(page,hold=h); await page.wait_for_timeout(900); mids.append(await frame(page))
        await setl(page,hold=1.5); await page.wait_for_timeout(900); s1=await frame(page)
        print(f'slider 0    == the scene before the change: {diff(s0,rest0)} px differ (0 = identical)')
        print(f'slider 1.5  == the scene after the change:  {diff(s1,rest1)} px differ (0 = identical)')
        print('slider 0.25 / 0.5 / 0.75 differ from each other and from both ends:', [diff(mids[0],mids[1])>1000, diff(mids[1],mids[2])>1000, diff(mids[0],s0)>1000, diff(mids[2],s1)>1000])
        # back and forth still works
        await setl(page,hold=0.5); await page.wait_for_timeout(900); again=await frame(page)
        print('back to 0.5 reproduces the same frame:', diff(again,mids[1]),'px differ')
        # release mid-way: the change carries on to the exact end state
        await setl(page,hold=0.4); await page.wait_for_timeout(700)
        await setl(page,holdOn=False); await page.wait_for_timeout(6000); end=await frame(page)
        print(f'released at 0.4 -> settles on the exact end state: {diff(end,rest1)} px differ')
        # UI: lab groups collapsed by default
        await page.reload(); await page.wait_for_selector('#lab-panel',state='attached'); await page.click('#lab-toggle'); await page.wait_for_timeout(500)
        info=await page.evaluate("[...document.querySelectorAll('#lab-panel .accordion-item')].map(i=>[i.querySelector('.accordion-title').textContent, !i.querySelector('.accordion-panel, div:nth-child(2)').hidden])")
        print('lab groups [title, open]:', info)
        await page.screenshot(path='lab_collapsed.png')
        await b.close()
asyncio.run(main())
