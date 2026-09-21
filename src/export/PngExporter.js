// Exports the current composition as a PNG. The paper-grain overlay
// lives in a separate DOM layer applied via CSS mix-blend-mode, so it
// isn't part of the WebGL canvas — it has to be drawn in manually
// here, with the same blend mode and opacity, or the export won't
// match what's visible on screen.

export function exportPNG(sceneManager, filename) {
  const renderer = sceneManager.getRenderer();
  const overlayCanvas = sceneManager.getOverlayCanvas();
  const sourceCanvas = renderer.domElement;

  const out = document.createElement('canvas');
  out.width = sourceCanvas.width;
  out.height = sourceCanvas.height;
  const ctx = out.getContext('2d');

  ctx.drawImage(sourceCanvas, 0, 0, out.width, out.height);

  if (overlayCanvas) {
    ctx.globalCompositeOperation = 'multiply';
    ctx.globalAlpha = sceneManager.getOverlayOpacity();
    ctx.drawImage(overlayCanvas, 0, 0, out.width, out.height);
    ctx.globalCompositeOperation = 'source-over';
    ctx.globalAlpha = 1;
  }

  out.toBlob((blob) => {
    if (!blob) return;
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename || `proun-${Date.now()}.png`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }, 'image/png');
}
