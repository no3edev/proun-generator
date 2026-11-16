# Pixel-compare two builds at rest and after two settled changes (canvas and composited stage).
# BASE_URL / NEW_URL = the two served builds. The NEW build gets lab values from INIT below.
# See tools/verify/README.md. Needs: python3, playwright (+ chromium), numpy, pillow, scipy.
import asyncio, hashlib, io
from PIL import Image, ImageChops
from shoot import *
import os
BASE=os.environ.get('BASE_URL','http://localhost:8103/'); PROTO=os.environ.get('NEW_URL','http://localhost:8104/')
async def run(pw, url, init=None):
    b, page = await new_page(pw, url, init=init)
    out = {}
    out['rest'] = await grab(page)
    out['rest_page'] = await page.locator('#stage-wrap').screenshot()
    await page.click('#advance-btn')
    await page.wait_for_timeout(4800)
    out['after1'] = await grab(page)
    out['after1_page'] = await page.locator('#stage-wrap').screenshot()
    await page.click('#advance-btn')
    await page.wait_for_timeout(4800)
    out['after2'] = await grab(page)
    out['after2_page'] = await page.locator('#stage-wrap').screenshot()
    await b.close()
    return out
def cmp(a, b):
    ia = Image.open(io.BytesIO(a)).convert('RGB'); ib = Image.open(io.BytesIO(b)).convert('RGB')
    if ia.size != ib.size: return 'size differs'
    d = ImageChops.difference(ia, ib); bb = d.getbbox()
    if bb is None: return 'IDENTICAL (0 differing pixels)'
    px = sum(1 for p in d.getdata() if p != (0,0,0))
    return f'{px} differing pixels, max channel delta {max(max(p) for p in d.getdata())}'
async def main():
    async with async_playwright() as pw:
        runs = {
          'baseline#1': await run(pw, BASE),
          'baseline#2': await run(pw, BASE),
          'proto': await run(pw, PROTO, "localStorage.setItem('proun.lab.v2', JSON.stringify({values:{groundOn:false, paintOn:false, colorTone:0, colorSoft:0.3, colorGrain:0.5}, open:false}))"),

        }
    for k in ['rest','after1','after2','rest_page','after1_page','after2_page']:
        print(f'[{k}]')
        print('  baseline#1 vs baseline#2 (harness determinism):', cmp(runs['baseline#1'][k], runs['baseline#2'][k]))
        print('  baseline vs proto            :', cmp(runs['baseline#1'][k], runs['proto'][k]))

    # also: the two advances really differ from rest (sanity: the test exercises transitions)
    print('sanity rest vs after1 (baseline):', cmp(runs['baseline#1']['rest'], runs['baseline#1']['after1']))
asyncio.run(main())
