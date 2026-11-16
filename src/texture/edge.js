// The edge character of box-like faces (stage 5.2a): which meshes have it, and setting it.
//
// Where a face meets its edge the paint is thinner (the paper shows through, broken up by the grain) and, a little further in,
// pools (PigmentResponse.js has the shader, DYNAMICS.edge the numbers). The distance to the face's edge is exact only for a box
// centred on its origin, so a box reads it from the face's size (cubes, planes, beams); an extruded outline or a flat disc (the
// triangle, frame, circle, crescent, ring and segment) reads it from a distance field of its outline (edgeField.js); a rod is a
// hairline, whose whole width would be the band. Strategies only: a legacy composition keeps its flat edges.

import { LEGACY_STRATEGY } from '../config/SceneConfig.js';
import { edgeFieldFor, emptyField } from './edgeField.js';

/**
 * How a mesh's edge distance is known: 'box' (a box centred on its origin: exact from the face's size), 'field' (an extruded
 * outline or a flat disc: read from a distance field of its outline, edgeField.js), or null (no band: a rod, whose whole width
 * would be band, the sphere).
 * @param {import('three').Mesh} mesh @returns {'box' | 'field' | null}
 */
export function edgeKind(mesh) {
  const g = mesh.geometry;
  if (!g) return null;
  if (g.type === 'BoxGeometry') return mesh.userData.shapeType === 'rod' ? null : 'box';
  if (g.type === 'ExtrudeGeometry' || g.type === 'CircleGeometry') return 'field';
  return null;
}

/** @param {import('three').Mesh} mesh */
export function hasEdge(mesh) {
  return edgeKind(mesh) !== null;
}

/** Whether a composition wants the edge character: any strategy, not the legacy generator. @param {{ composition: { strategy: string } } | null} config */
export function edgeWanted(config) {
  return !!config && config.composition.strategy !== LEGACY_STRATEGY;
}

/**
 * Gives a mesh its edge character (or not) as the composition `config` wants. Set at once: it is a quality of the surface, not a
 * change in flight, and legacy never has it.
 * @param {import('three').Mesh} mesh @param {{ composition: { strategy: string } } | null} config
 */
export function setEdgeNow(mesh, config) {
  const f = mesh.userData && mesh.userData.front;
  if (!f || !f.uEdgeAmt) return;
  // The silhouette's soft edge (PigmentResponse.js) is the fragment's alpha near the outline, so under a strategy the materials are
  // drawn blended (sorted back to front; depth still decides what is in front; alpha is 1 away from the outline). Under the legacy
  // generator they stay opaque, drawn exactly as before: the draw order of equal depths would otherwise differ mid-transition.
  const blended = edgeWanted(config);
  const mats = Array.isArray(mesh.material) ? mesh.material : mesh.material ? [mesh.material] : [];
  mats.forEach((m) => { if (m.transparent !== blended) { m.transparent = blended; m.needsUpdate = true; } });
  // the materials' response to the event clock is for strategies only (PigmentResponse.js, stage 5.4)
  if (f.uRespAmt) f.uRespAmt.value = blended ? 1 : 0;
  const kind = edgeWanted(config) ? edgeKind(mesh) : null;
  let field = null;
  if (kind === 'field') field = edgeFieldFor(mesh.geometry);
  f.uEdgeAmt.value = kind === 'box' || field ? 1 : 0;
  f.uEdgeKind.value = field ? 1 : 0;
  f.uEdgeSdf.value = field ? field.texture : emptyField;
  f.uEdgeR.value = field ? field.radius : 0;
}
