import { describe, it, expect, beforeEach } from 'vitest';
import * as THREE from 'three';
import { watchContext } from '../src/core/contextRecovery.js';
import { initGround, updateGroundCache, invalidateGroundCache, groundCacheStats } from '../src/texture/GroundLayer.js';

// Stage 7.0: a lost WebGL context (GPU reset, sleep, memory pressure) must not leave the paper black after it is restored. Found in
// a browser: after loseContext/restoreContext the shapes came back and the ground was black (81% of the pixels differed), because the
// ground cache believed its picture was still there.

/** an event whose preventDefault is recorded, as the browser's is */
function evt(type) {
  const e = new Event(type, { cancelable: true });
  return e;
}

describe('context recovery (watchContext)', () => {
  it('says lost while the context is away, offers the restore, and calls onRestored when it is back', () => {
    const canvas = new EventTarget();
    let restored = 0;
    const stats = watchContext(canvas, { onRestored: () => restored++ });
    expect(stats).toEqual({ lost: false, losses: 0, restores: 0 });
    const lost = evt('webglcontextlost');
    canvas.dispatchEvent(lost);
    expect(lost.defaultPrevented).toBe(true);          // otherwise the browser never gives the context back
    expect(stats).toMatchObject({ lost: true, losses: 1, restores: 0 });
    expect(restored).toBe(0);
    canvas.dispatchEvent(evt('webglcontextrestored'));
    expect(stats).toMatchObject({ lost: false, losses: 1, restores: 1 });
    expect(restored).toBe(1);
  });

  it('survives any number of losses and restores', () => {
    const canvas = new EventTarget();
    let restored = 0;
    const stats = watchContext(canvas, { onRestored: () => restored++ });
    for (let i = 0; i < 50; i++) { canvas.dispatchEvent(evt('webglcontextlost')); canvas.dispatchEvent(evt('webglcontextrestored')); }
    expect(stats).toMatchObject({ lost: false, losses: 50, restores: 50 });
    expect(restored).toBe(50);
  });
});

describe('the ground cache after a restore', () => {
  /** a renderer double: it only counts what is drawn */
  function fakeRenderer() {
    const r = { draws: 0, target: null, size: new THREE.Vector2(200, 150) };
    r.getDrawingBufferSize = (v) => v.copy(r.size);
    r.getRenderTarget = () => r.target;
    r.setRenderTarget = (t) => { r.target = t; };
    r.render = () => { r.draws++; };
    return r;
  }
  beforeEach(() => { initGround(new THREE.Scene()); });

  it('draws once, then not again while nothing changes (the cache is what saves the GPU)', () => {
    const r = fakeRenderer();
    expect(updateGroundCache(r)).toBe(true);
    expect(updateGroundCache(r)).toBe(false);
    expect(updateGroundCache(r)).toBe(false);
    expect(r.draws).toBe(1);
  });

  it('draws again after invalidateGroundCache, although none of its numbers changed (the restored texture is empty)', () => {
    const r = fakeRenderer();
    updateGroundCache(r);
    expect(updateGroundCache(r)).toBe(false);          // what the bug looked like: nothing to redraw, a black ground
    const before = groundCacheStats.draws;
    invalidateGroundCache();
    expect(updateGroundCache(r)).toBe(true);
    expect(groundCacheStats.draws).toBe(before + 1);
    expect(updateGroundCache(r)).toBe(false);          // and then it is quiet again
  });

  it('a loss and restore through the watcher redraws the ground exactly once', () => {
    const r = fakeRenderer();
    const canvas = new EventTarget();
    watchContext(canvas, { onRestored: invalidateGroundCache });
    updateGroundCache(r);
    const drawn = r.draws;
    canvas.dispatchEvent(evt('webglcontextlost'));
    canvas.dispatchEvent(evt('webglcontextrestored'));
    updateGroundCache(r); updateGroundCache(r); updateGroundCache(r);
    expect(r.draws).toBe(drawn + 1);
  });
});
