import * as THREE from 'three';
import { Palette } from '../palette/Palette.js';
import { Billboard } from './Billboard.js';
import { Tween } from './Tween.js';
import { Composition } from './Composition.js';
import { makeGrainCanvas } from '../texture/PaperTexture.js';

let renderer, scene, camera, stageWrap, clock;
let overlayCanvas = null; // cached so PNG export can composite it in
const OVERLAY_OPACITY = 0.5; // keep in sync with panel.css #paper-overlay { opacity }
const frustumSize = 6;

const ORIENTATIONS = {
  landscape: { w: 720, h: 560 },
  portrait: { w: 560, h: 720 },
  square: { w: 640, h: 640 }
};
let orientation = 'landscape';

function makeCamera() {
  const aspect = stageWrap.clientWidth / stageWrap.clientHeight;
  const cam = new THREE.OrthographicCamera(
    (-frustumSize * aspect) / 2, (frustumSize * aspect) / 2,
    frustumSize / 2, -frustumSize / 2,
    0.1, 100
  );
  // fixed oblique axonometric-style viewpoint
  cam.position.set(4.2, 3.4, 5.2);
  cam.lookAt(0, 0, 0);
  return cam;
}

function applyOrientation(name) {
  orientation = name;
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
  overlayCanvas = makeGrainCanvas(600, 600, Palette.active().paper, { noiseStrength: 10, blotches: 14 });
  overlay.style.backgroundImage = `url(${overlayCanvas.toDataURL()})`;
  overlay.style.backgroundSize = 'cover';
}

function loop() {
  requestAnimationFrame(loop);
  const dt = clock.getDelta() * 1000;
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

    applyOrientation('landscape');
    updateBackground();

    camera = makeCamera();
    Billboard.computeFromCamera(camera);
    Composition.init(scene);

    window.addEventListener('resize', () => applyOrientation(orientation));
  },

  applyOrientation,
  updateBackground,
  loop,

  getRenderer() { return renderer; },
  getOverlayCanvas() { return overlayCanvas; },
  getOverlayOpacity() { return OVERLAY_OPACITY; },

  get orientation() { return orientation; }
};
