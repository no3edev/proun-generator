import * as THREE from 'three';
import { Palette } from '../palette/Palette.js';
import { SceneConfig } from '../config/store.js';
import { Billboard } from './Billboard.js';
import { Tween } from './Tween.js';
import { Composition } from './Composition.js';
import { Rhythm } from './Rhythm.js';
import { setHatchColors } from '../texture/hatch.js';
import { setEdgePaper, setMaterialEnergy } from '../texture/PigmentResponse.js';
import { initGround, setGroundPaper, setGroundAspect, updateGroundMotion, updateGroundCache, invalidateGroundCache, setGroundTile } from '../texture/GroundLayer.js';
import { watchContext } from './contextRecovery.js';
import { stageSize } from './stageFit.js';
import { createPaperFade } from './PaperFade.js';
import { isExhibitionActive } from './ExhibitionMode.js';
import { renderAtScale, renderTiles, planTiles, groundTileUv } from '../export/hiRes.js';
import { CAMERA, ORIENTATIONS } from '../config/defaults.js';
import { frameDt } from './frameClock.js';
import { AutoAdvance } from './AutoAdvance.js';

let renderer, scene, camera, stageWrap, clock;
/** WebGL context loss counters (core/contextRecovery.js); `lost` stops drawing until the browser gives the context back */
let contextStats = { lost: false, losses: 0, restores: 0 };
let frameMs = 16.7; // smoothed time between frames (the display's rate while the scene keeps up)
const frustumSize = CAMERA.frustumSize;

function makeCamera() {
  const aspect = stageWrap.clientWidth / stageWrap.clientHeight;
  const cam = new THREE.OrthographicCamera(
    (-frustumSize * aspect) / 2, (frustumSize * aspect) / 2,
    frustumSize / 2, -frustumSize / 2,
    CAMERA.near, CAMERA.far
  );
  cam.position.set(...CAMERA.position);
  cam.lookAt(0, 0, 0);
  return cam;
}

function applyOrientation(name) {
  const dims = ORIENTATIONS[name];
  const gl = renderer.getContext();
  const maxSide = gl && gl.getParameter ? Math.min(...gl.getParameter(gl.MAX_VIEWPORT_DIMS), gl.getParameter(gl.MAX_RENDERBUFFER_SIZE)) : Infinity;
  const { w, h, pixelRatio } = stageSize({
    dims, viewportW: window.innerWidth, viewportH: window.innerHeight, exhibition: isExhibitionActive(),
    dpr: window.devicePixelRatio || 1, maxSide
  });

  stageWrap.style.width = w + 'px';
  stageWrap.style.height = h + 'px';
  renderer.setPixelRatio(pixelRatio);
  renderer.setSize(w, h, true);
  setGroundAspect(w / h);

  if (camera) {
    const aspect = w / h;
    camera.left = (-frustumSize * aspect) / 2;
    camera.right = (frustumSize * aspect) / 2;
    camera.top = frustumSize / 2;
    camera.bottom = -frustumSize / 2;
    camera.updateProjectionMatrix();
  }
}

/** The paper and its ink on screen (core/PaperFade.js): the first picture sets them at once, a palette change fades them over the change. */
const paperFade = createPaperFade({
  apply: (paper, ink) => {
    renderer.setClearColor(paper, 1);
    setGroundPaper(paper);
    setEdgePaper(paper);
    setHatchColors(paper, ink);
  }
});

/** @param {boolean} [fade] over the transition window (a palette change) rather than at once */
function updateBackground(fade = false) {
  const { paper, ink } = Palette.active();
  if (fade) paperFade.fadeTo(paper, ink, SceneConfig.get().time.durationMs);
  else paperFade.setNow(paper, ink);
}

function loop() {
  requestAnimationFrame(loop);
  const raw = clock.getDelta() * 1000;
  frameMs += (raw - frameMs) * 0.05;          // smoothed, for the lab's readout
  const dt = frameDt(raw);                      // one animation clock for everything below (core/frameClock.js)
  Tween.update(dt);
  Rhythm.update(dt);
  paperFade.update(dt, Rhythm.hold);            // the paper changes with the shapes, and stands still with them under the lab pause
  AutoAdvance.update(dt);
  setMaterialEnergy(Rhythm.energy);
  updateGroundMotion(Rhythm, dt, SceneConfig.get().seed);
  renderFrame();
}

/** One frame: bring the cached ground up to date, then draw the scene. */
function renderFrame() {
  if (contextStats.lost) return;     // nothing to draw on until the context is restored
  updateGroundCache(renderer);
  renderer.render(scene, camera);
}

export const SceneManager = {
  /** Fits the stage to the window again (the exhibition mode changed what it fits). */
  refit() { applyOrientation(SceneConfig.get().orientation); },

  /** How often the WebGL context was lost and restored (diagnostics). */
  contextStats() { return { ...contextStats }; },

  init() {
    stageWrap = document.getElementById('stage-wrap');
    const canvasEl = document.getElementById('scene');

    // preserveDrawingBuffer so PNG export can read the canvas back
    // reliably regardless of render/export timing
    renderer = new THREE.WebGLRenderer({
      canvas: canvasEl, antialias: true, alpha: false, preserveDrawingBuffer: true
    });
    // a lost context (GPU reset, sleep, memory pressure) must not leave the paper black after it comes back
    contextStats = watchContext(canvasEl, { onRestored: invalidateGroundCache });
    scene = new THREE.Scene();
    clock = new THREE.Clock();
    initGround(scene);

    applyOrientation(SceneConfig.get().orientation);
    updateBackground();

    camera = makeCamera();
    Billboard.computeFromCamera(camera);
    Composition.init(scene);

    // the config is the source of truth; the renderer just follows it
    SceneConfig.subscribe((next, prev) => {
      if (next.orientation !== prev.orientation) applyOrientation(next.orientation);
      if (next.palette !== prev.palette) updateBackground(true);
    });
    window.addEventListener('resize', () => applyOrientation(SceneConfig.get().orientation));
    // a window dragged to a screen with another pixel ratio changes the ratio without always changing the size
    const watchPixelRatio = () => {
      const mq = window.matchMedia && window.matchMedia(`(resolution: ${window.devicePixelRatio || 1}dppx)`);
      if (!mq) return;
      mq.addEventListener('change', () => { applyOrientation(SceneConfig.get().orientation); watchPixelRatio(); }, { once: true });
    };
    watchPixelRatio();
    // A hidden tab stops the frames; the first frame after it would carry the whole absence. Drop that gap so
    // the animation and the hold resume exactly where they stopped, whatever the length of the absence.
    document.addEventListener('visibilitychange', () => { if (!document.hidden) clock.getDelta(); });
  },

  loop,

  /**
   * Renders one frame at `scale` x the on-screen resolution, hands the
   * canvas to `draw` synchronously, then restores the renderer (see
   * export/hiRes.js).
   */
  renderScaled(scale, draw) {
    return renderAtScale(renderer, scale, renderFrame, draw);
  },

  /**
   * A picture too big for one drawing buffer, rendered in tiles (export/hiRes.js): the same camera with a view offset, the ground for
   * the same part, each tile copied into one output canvas. The renderer and the camera are put back afterwards, always. It is
   * synchronous on purpose: no frame of the live loop may run while the camera has an offset.
   * @param {number} width @param {number} height the output size @param {number} tileSide
   * @returns {HTMLCanvasElement}
   */
  renderTiled(width, height, tileSide) {
    const ratio = renderer.getPixelRatio();
    const size = renderer.getSize(new THREE.Vector2());
    try {
      renderer.setPixelRatio(1);
      return renderTiles({
        width, height, tiles: planTiles(width, height, tileSide),
        renderTile: (tile, copy) => {
          renderer.setSize(tile.w, tile.h, false);
          camera.setViewOffset(width, height, tile.x, tile.y, tile.w, tile.h);
          setGroundTile(groundTileUv(tile, width, height));
          renderFrame();
          copy(renderer.domElement);
        }
      });
    } finally {
      camera.clearViewOffset();
      setGroundTile(null);
      renderer.setPixelRatio(ratio);
      renderer.setSize(size.x, size.y, false);
      renderFrame();
    }
  },

  /** The largest drawing buffer side the GPU will give us. */
  getMaxRenderSize() {
    const gl = renderer.getContext();
    const viewport = gl.getParameter(gl.MAX_VIEWPORT_DIMS);
    return Math.min(viewport[0], viewport[1], gl.getParameter(gl.MAX_RENDERBUFFER_SIZE), renderer.capabilities.maxTextureSize);
  },

  getRenderer() { return renderer; },
  /** Smoothed milliseconds between frames — a drop below the display's rate means the scene is not keeping up. */
  getFrameMs() { return frameMs; }
};
