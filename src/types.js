// Shared JSDoc types. Plain JS, no runtime content: files that opt in with
// `// @ts-check` (see tsconfig.json, `npm run typecheck`) import these with
//   /** @typedef {import('../types.js').SceneConfigState} SceneConfigState */

/**
 * One frozen instance of a locked shape type: exactly what was on screen.
 * @typedef {Object} LockedEntry
 * @property {[number, number, number]} position
 * @property {[number, number, number]} rotation  Euler radians (XYZ)
 * @property {[number, number, number]} scale
 * @property {string} hex  "#rrggbb"
 */

/**
 * @typedef {Object} ShapeSettings per-shape settings inside a SceneConfig
 * @property {boolean} visible
 * @property {number} count      instances of this shape (0 = none)
 * @property {number} sizeMin    size multiplier range, sizeMin <= sizeMax
 * @property {number} sizeMax
 * @property {number} spread     scales the position-sampling bounds, 0..2
 * @property {boolean} snapRotation  true = every rotation angle is a multiple
 *           of 45 degrees instead of an arbitrary angle
 * @property {LockedEntry[] | null} locked  non-null = this type is frozen:
 *           these instances are used verbatim (count is forced to their
 *           length) and the seed, size, spread and palette don't affect them
 */

/**
 * @typedef {Object} TimeSettings
 * @property {number} durationMs  transition length
 * @property {number} holdMs      rest after a transition; the auto-advance period is durationMs + holdMs
 * @property {boolean} autoAdvance
 * @property {boolean} playlist     with Auto: the next change is the next Library preset (shuffled, none twice before all) instead of a new seed
 */

/**
 * The whole scene, as one serializable object (see config/SceneConfig.js).
 * @typedef {Object} SceneConfigState
 * @property {number} version     schema version (CONFIG_VERSION)
 * @property {number} seed        uint32; with the settings, fully determines the composition
 * @property {string} palette
 * @property {string} orientation
 * @property {TimeSettings} time
 * @property {CompositionSettings} composition
 * @property {Record<string, ShapeSettings>} shapes  keyed by shape `type`
 */

/**
 * @typedef {Object} CompositionSettings
 * @property {string} strategy  'legacy' (independent placement, the original
 *           generator) or a strategy in generator/strategies. A strategy
 *           owns the shape counts: a type's `count` then only says whether
 *           the type may be used (0 = excluded).
 */

/**
 * What a SceneConfig needs to know about the app (config/store.js supplies
 * the real values; tests supply small fakes).
 * @typedef {Object} SceneConfigContext
 * @property {string[]} shapeTypes
 * @property {string[]} paletteNames
 * @property {Record<string, string>} [paletteAliases]  removed palette names -> the palette that answers to them now
 * @property {string[]} orientationNames
 * @property {string[]} [strategyNames]  selectable composition strategies (default: ['legacy'])
 * @property {string} defaultPalette
 * @property {string} defaultOrientation
 * @property {() => number} randomSeed
 * @property {Record<string, Partial<ShapeSettings>>} [shapeDefaults]  per-type overrides of SHAPE_DEFAULTS
 */

/**
 * @typedef {Object} ConfigMeta
 * @property {boolean} replaced  true for replace() (a preset/restore load)
 */

/**
 * One generated instance, plain JSON-safe data (generator/generate.js).
 * @typedef {Object} LayoutEntry
 * @property {string} type
 * @property {number} index
 * @property {[number, number, number]} position
 * @property {[number, number, number]} rotation  Euler radians; ignored for facesCamera shapes
 * @property {[number, number, number]} scale
 * @property {string} hex
 * @property {number} [plannedDepth]  for a strategy's entries: the depth along the view axis the strategy planned, before the
 *           depth solver moved the shape (absent for the legacy generator and for locked shapes)
 * @property {string} [role]  compositional role (anchor, support, connector,
 *           accent, detail) when a composition strategy made the entry;
 *           absent for the legacy generator
 */

/**
 * What a shape module provides (shapes/registry.js).
 * @typedef {Object} ShapeDef
 * @property {string} type
 * @property {string} label
 * @property {'sphere'} [volumeKind]  the shape's real volume is a ball (radius = its largest half extent), not an oriented box
 * @property {boolean} facesCamera
 * @property {{x: number, y: number, z: number}} localHalfExtents
 * @property {(hex: string) => import('three').Mesh} create
 * @property {(rng: () => number) => import('three').Vector3} randomScale
 * @property {'accent' | 'ink'} [colorRole]  'ink' = always the palette's ink color
 *           instead of a random accent (default 'accent')
 * @property {boolean} [collides]  false = passes through other shapes: not
 *           pushed by collision resolution and not an obstacle (default true)
 * @property {Partial<ShapeSettings>} [defaults]  overrides of the default
 *           per-shape settings (e.g. { count: 0 } for a shape that starts off)
 */

export {};
