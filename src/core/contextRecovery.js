// @ts-check

// WebGL context loss. A GPU reset, a driver update, a laptop waking up or the browser reclaiming memory can take the context away
// from a page that has been running for hours; the browser then offers to give it back ("restore"). three.js re-creates its own GPU
// objects when that happens, but what OUR code remembers about the GPU's contents is stale: the ground cache believes its picture is
// still there (it is black). So: say "lost" so nothing draws meanwhile, and on restore make the caches draw again.
//
// DOM-free apart from the EventTarget it is given, so the tests drive it with a fake canvas.

/**
 * @param {EventTarget} canvas the WebGL canvas
 * @param {{ onRestored: () => void }} handlers called when the context is back, before the next frame is drawn
 * @returns {{ lost: boolean, losses: number, restores: number }} live counters (the loop reads `lost`; diagnostics read the rest)
 */
export function watchContext(canvas, handlers) {
  const stats = { lost: false, losses: 0, restores: 0 };
  canvas.addEventListener('webglcontextlost', (event) => {
    event.preventDefault();               // without this the browser never offers a restore
    stats.lost = true;
    stats.losses += 1;
  });
  canvas.addEventListener('webglcontextrestored', () => {
    stats.lost = false;
    stats.restores += 1;
    handlers.onRestored();
  });
  return stats;
}
