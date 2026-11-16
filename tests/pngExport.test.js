import { describe, it, expect } from 'vitest';
import { composeExport, exportFilename } from '../src/export/PngExporter.js';

// v0.14.0: the paper is drawn by WebGL, so the export is the renderer's canvas copied as it is. These pin that no DOM overlay (a multiply
// pass over the picture) comes back into the export without the screen having it too.
function fakeCanvas() {
  const calls = [];
  const ctx = {
    calls,
    drawImage: (...a) => calls.push(['drawImage', ...a]),
    set globalCompositeOperation(v) { calls.push(['composite', v]); },
    set globalAlpha(v) { calls.push(['alpha', v]); }
  };
  return { width: 0, height: 0, getContext: () => ctx, ctx };
}

describe('composeExport', () => {
  it('copies the source once, at its own size, with no blending or alpha', () => {
    const out = fakeCanvas();
    const res = composeExport({ source: { width: 1440, height: 1120 }, createCanvas: () => out });
    expect(res).toBe(out);
    expect([out.width, out.height]).toEqual([1440, 1120]);
    expect(out.ctx.calls).toEqual([['drawImage', { width: 1440, height: 1120 }, 0, 0, 1440, 1120]]);
  });

  it('throws when there is no 2D context', () => {
    expect(() => composeExport({ source: { width: 1, height: 1 }, createCanvas: () => ({ getContext: () => null }) })).toThrow();
  });
});

describe('exportFilename', () => {
  it('tags scales above 1x', () => {
    expect(exportFilename(7, 1)).toBe('proun-7.png');
    expect(exportFilename(7, 2)).toBe('proun-7@2x.png');
  });
});
