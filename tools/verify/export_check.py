# PNG export at 1x/2x/4x vs the screen, cross-size consistency, and a paused (mid-change) export.
# See tools/verify/README.md. Needs: python3, playwright (+ chromium), numpy, pillow, scipy.
import asyncio, io, time
import numpy as np
from PIL import Image
from scipy.ndimage import gaussian_filter
from shoot import *
import os
URL=os.environ.get('APP_URL','http://localhost:8104/')
async def setl(page, **kw):
    await page.evaluate("(()=>{const L=window.__proun.Lab;"+"".join(f"L.set('{k}',{str(v).lower() if isinstance(v,bool) else v});" for k,v in kw.items())+"})()")
async def export(page, scale):
    await page.select_option('#export-scale', str(scale))
    t=time.time()
    async with page.expect_download(timeout=60000) as d:
        await page.click('#export-png-btn')
    dl=await d.value; path=await dl.path(); ms=(time.time()-t)*1000
    return Image.open(path).convert('RGB'), ms
async def stage(page): return Image.open(io.BytesIO(await page.locator('#paper-overlay').screenshot())).convert('RGB')
def arr(im): return np.asarray(im,dtype=float)
def mad(a,b): return float(np.abs(arr(a)-arr(b)).mean())
def bands(im, fr=(0.03,0.04,0.30,0.30)):
    a=arr(im); W=1000; h=int(a.shape[0]*W/a.shape[1])
    a=arr(im.resize((W,h),Image.LANCZOS))/255; H,Wd=a.shape[:2]
    c=a[int(fr[1]*H):int(fr[3]*H),int(fr[0]*Wd):int(fr[2]*Wd)]; L=0.2126*c[...,0]+0.7152*c[...,1]+0.0722*c[...,2]; m=L.mean()
    g1=gaussian_filter(L,1.5); g2=gaussian_filter(L,6); g3=gaussian_filter(L,24)
    return L.std()/m,(L-g1).std()/m,(g1-g2).std()/m,(g2-g3).std()/m
async def main():
    async with async_playwright() as pw:
        b,page=await new_page(pw,URL)
        screen=await stage(page); W,H=screen.size
        ex={}
        for s in (1,2,4):
            im,ms=await export(page,s); ex[s]=im
            print(f'export {s}x: {im.size[0]}x{im.size[1]} px (screen {W}x{H}) in {ms:.0f} ms')
        after=await stage(page)
        print(f'the screen is untouched by exporting: {np.abs(arr(screen)-arr(after)).max()==0}')
        print(f'1x export vs the on-screen composite: mean abs difference {mad(ex[1],screen):.2f}/255, max {np.abs(arr(ex[1])-arr(screen)).max():.0f}')
        down=ex[4].resize((W,H),Image.LANCZOS); down2=ex[2].resize((W,H),Image.LANCZOS)
        print(f'4x export downsampled vs 1x export: mean abs difference {mad(down,ex[1]):.2f}/255 | 2x: {mad(down2,ex[1]):.2f}/255')
        for s in (1,2,4):
            t,f,m,c=bands(ex[s]); print(f'  ground texture bands at {s}x (total/fine/mid/coarse %): {t*100:.2f} / {f*100:.2f} / {m*100:.2f} / {c*100:.2f}')
        await b.close()
        # mid-change export: pause the last change half-way, then export — it must match what is on screen
        b,page=await new_page(pw,URL); await page.click('#advance-btn'); await page.wait_for_timeout(9000)
        await setl(page,holdOn=True,hold=1.0); await page.wait_for_timeout(1500)
        screen=await stage(page); im,ms=await export(page,1)
        print(f'MID-CHANGE (paused at 1.0: shapes mid-way, ground mid-morph): 1x export vs screen: mean abs difference {mad(im,screen):.2f}/255, max {np.abs(arr(im)-arr(screen)).max():.0f}')
        im4,ms4=await export(page,4); print(f'  and the 4x export of the paused scene: {im4.size[0]}x{im4.size[1]} in {ms4:.0f} ms; downsampled vs 1x export: {mad(im4.resize(im.size,Image.LANCZOS),im):.2f}/255')
        await b.close()
asyncio.run(main())
