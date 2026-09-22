import cubeFixed from './cubeFixed.js';
import cubeVariable from './cubeVariable.js';
import circle from './circle.js';
import sphere from './sphere.js';
import triangle from './triangle.js';
import plane from './plane.js';

// The single place every shape must be registered. Add a new shape by
// creating a module with the same contract:
//   {
//     type: 'my-shape',        // unique id, used as the instance key
//     label: 'My Shape',       // shown in the panel checkbox
//     facesCamera: false,      // true only if it should billboard like the circle
//     localHalfExtents: {x,y,z}, // unscaled bounding half-extents, for collision
//     create(hex) { ... },     // returns a THREE.Mesh
//     randomScale() { ... }    // returns a THREE.Vector3
//   }
// and add one line below. Composition, CollisionResolver, and the UI
// panel all iterate this list generically — nothing else needs edits.
export const shapeRegistry = [cubeFixed, cubeVariable, circle, sphere, triangle, plane];

export function getShape(type) {
  return shapeRegistry.find((s) => s.type === type);
}
