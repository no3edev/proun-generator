import cubeFixed from './cubeFixed.js';
import cubeVariable from './cubeVariable.js';
import circle from './circle.js';
import sphere from './sphere.js';
import triangle from './triangle.js';
import plane from './plane.js';
import rod from './rod.js';

// The single place every shape must be registered. Add a new shape by
// creating a module with the same contract:
//   {
//     type: 'my-shape',        // unique id, used as the instance key
//     label: 'My Shape',       // shown in the panel checkbox
//     facesCamera: false,      // true only if it should billboard like the circle
//     localHalfExtents: {x,y,z}, // unscaled bounding half-extents, for collision
//     create(hex) { ... },     // returns a THREE.Mesh honoring the shading
//                              // contract (texture/materials.js): userData
//                              // shapeType / baseColor / applyShade
//     randomScale(rng) { ... } // returns a THREE.Vector3; draw ONLY from the
//                              // rng passed in (a () => [0,1) function, like
//                              // Math.random) so seeds reproduce
//     // optional:
//     colorRole: 'ink',        // always the palette's ink, not a random accent
//     collides: false,         // passes through other shapes (lines, rods)
//     defaults: { count: 0 },  // starts differently from the global defaults
//   }
// and add one line below. The generator, Composition, CollisionResolver
// and the UI panel all iterate this list generically — nothing else needs
// edits (optionally add a glyph in ui/shapeIcons.js).
/** @type {import('../types.js').ShapeDef[]} */
export const shapeRegistry = [cubeFixed, cubeVariable, circle, sphere, triangle, plane, rod];

export function getShape(type) {
  return shapeRegistry.find((s) => s.type === type);
}
