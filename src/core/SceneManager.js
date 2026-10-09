import * as THREE from 'three';
import { Palette } from '../palette/Palette.js';
import { SceneConfig } from '../config/store.js';
import { Billboard } from './Billboard.js';
import { Tween } from './Tween.js';
import { Composition } from './Composition.js';
import { paperStructure, tintStructure } from '../texture/PaperTexture.js';
import { renderAtScale } from '../export/hiRes.js';
import { CAMERA, ORIENTATIONS, OVERLAY_OPACITY, MAX_FRAME_MS } from '../config/defaults.js';

let renderer, scene, camera, stageWrap, clock;
let overlayCanvas = null; // cached so PNG export can composite it in
const frustumSize = CAMERA.frustumSize;

function makeCamera() {
  const aspect = stageWrap.clientWidth / stageWrap.clientHeight;
  const cam = new THREE.OrthographicCamera(
    (-frustumSize * aspect) / 2, (frustumSize * aspect) / 2,
    frustumSize / 2, -frustumSize / 2,
    0.1, 100
  );
  cam.position.set(...CAMERA.position);
  cam.lookAt(0, 0, 0);
  return cam;
}

function applyOrientation(name) {
  const dims = ORIENTATIONS[name];
  const maxW = window.innerWidth * 0.92;
  const maxH = window.innerHeight * 0.86;
  const scale = Math.min(maxW / dims.w, maxH / dims.h, 1);
  const w = dims.w * scale, h = dims.h * scale;

  stageWrap.style.width = w + 'px';
  stageWrap.style.height = h + 'px';
  renderer.setPixelRatio(window.devicePixelRatio || 1);
  renderer.setSize(w, h, true);

  if (camera) {
    const aspect = w / h;
    camera.left = (-frustumSize * aspect) / 2;
    camera.right = (frustumSize * aspect) / 2;
    camera.top = frustumSize / 2;
    camera.bottom = -frustumSize / 2;
    camera.updateProjectionMatrix();
  }
}

function updateBackground() {
  renderer.setClearColor(new THREE.Color(Palette.active().paper), 1);
  const overlay = document.getElementById('paper-overlay');
  overlay.style.opacity = String(OVERLAY_OPACITY);
  overlayCanvas = tintStructure(paperStructure(), Palette.active().paper);
  overlay.style.backgroundImage = `url(${overlayCanvas.toDataURL()})`;
  overlay.style.backgroundSize = 'cover';
}

function loop() {
  requestAnimationFrame(loop);
  const dt = Math.min(clock.getDelta() * 1000, MAX_FRAME_MS);
  Tween.update(dt);
  renderer.render(scene, camera);
}

export const SceneManager = {
  init() {
    stageWrap = document.getElementById('stage-wrap');
    const canvasEl = document.getElementById('scene');

    // preserveDrawingBuffer so PNG export can read the canvas back
    // reliably regardless of render/export timing
    renderer = new THREE.WebGLRenderer({
      canvas: canvasEl, antialias: true, alpha: false, preserveDrawingBuffer: true
    });
    scene = new THREE.Scene();
    clock = new THREE.Clock();

    applyOrientation(SceneConfig.get().orientation);
    updateBackground();

    camera = makeCamera();
    Billboard.computeFromCamera(camera);
    Composition.init(scene);

    // the config is the source of truth; the renderer just follows it
    SceneConfig.subscribe((next, prev) => {
      if (next.orientation !== prev.orientation) applyOrientation(next.orientation);
      if (next.palette !== prev.palette) updateBackground();
    });
    window.addEventListener('resize', () => applyOrientation(SceneConfig.get().orientation));
  },

  loop,

  /**
   * Renders one frame at `scale` x the on-screen resolution, hands the
   * canvas to `draw` synchronously, then restores the renderer (see
   * export/hiRes.js).
   */
  renderScaled(scale, draw) {
    return renderAtScale(renderer, scale, () => renderer.render(scene, camera), draw);
  },

  /** The largest drawing buffer side the GPU will give us. */
  getMaxRenderSize() {
    const gl = renderer.getContext();
    const viewport = gl.getParameter(gl.MAX_VIEWPORT_DIMS);
    return Math.min(viewport[0], viewport[1], gl.getParameter(gl.MAX_RENDERBUFFER_SIZE), renderer.capabilities.maxTextureSize);
  },

  getRenderer() { return renderer; },
  getOverlayCanvas() { return overlayCanvas; },
  getOverlayOpacity() { return OVERLAY_OPACITY; }
};
