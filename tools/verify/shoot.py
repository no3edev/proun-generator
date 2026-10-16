# Shared helpers: a headless Chromium (software WebGL) page with SEEDED Math.random / crypto
# streams, so two runs are comparable pixel for pixel. three.js draws Math.random for object
# UUIDs, so those draws get their own stream (otherwise creating one more three object shifts
# every other random draw). Needs the app served over http (see README).
import asyncio, hashlib, sys, json, io
from playwright.async_api import async_playwright
STUB = """
(() => {
  let a = 0x9e3779b9;
  const rnd = () => { a = (a + 0x6d2b79f5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
  // three.js draws Math.random for object UUIDs; give those their own stream so
  // adding or removing a three object cannot shift the paint grain's draws
  let b = 0x1234abcd;
  const rndB = () => { b = (b + 0x6d2b79f5) >>> 0; let t = b; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
  Math.random = () => (new Error().stack || '').includes('generateUUID') ? rndB() : rnd();
  let c = 12345;
  const g = (arr) => { for (let i = 0; i < arr.length; i++) { c = (Math.imul(c, 1664525) + 1013904223) >>> 0; arr[i] = c; } return arr; };
  Object.defineProperty(crypto, 'getRandomValues', { value: g });
})();
"""
ARGS = ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--use-gl=angle']
async def new_page(pw, url, palette=None, init=None):
    b = await pw.chromium.launch(args=ARGS)
    ctx = await b.new_context(viewport={'width': 1280, 'height': 800}, device_scale_factor=1)
    await ctx.route('**/fonts.googleapis.com/**', lambda r: r.abort())
    page = await ctx.new_page()
    await page.add_init_script(STUB)
    if init: await page.add_init_script(init)
    await page.goto(url)
    await page.wait_for_selector('#scene')
    await page.wait_for_timeout(800)
    return b, page
async def grab(page):
    data = await page.evaluate("document.getElementById('scene').toDataURL('image/png')")
    import base64
    return base64.b64decode(data.split(',')[1])
