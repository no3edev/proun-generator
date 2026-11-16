// @ts-check
import { axisThrust } from './axisThrust.js';
import { discBeams } from './discBeams.js';
import { centralCluster } from './centralCluster.js';
import { tower } from './tower.js';
import { cross } from './cross.js';
import { mass } from './mass.js';

/** @typedef {import('./run.js').Strategy} Strategy */

// The composition strategies. 'legacy' is the original generator (independent
// random placement; it is not in this table because generateLayout() runs it
// directly, byte-for-byte as before) and stays the default, so every existing
// seed, preset and link produces exactly the layout it always did.
//
// To add a strategy: a module exporting a `Strategy` ({ label, plan(ctx) }),
// one line here, and tests. See axisThrust.js for the shape of one.

export const DEFAULT_STRATEGY = 'legacy';

/** @type {Record<string, Strategy>} */
export const STRATEGIES = {
  'axis-thrust': axisThrust,
  'disc-beams': discBeams,
  'central-cluster': centralCluster,
  tower,
  cross,
  mass
};

/** every selectable strategy name, legacy first */
export const STRATEGY_NAMES = [DEFAULT_STRATEGY, ...Object.keys(STRATEGIES)];

/** @type {Record<string, string>} */
export const STRATEGY_LABELS = {
  [DEFAULT_STRATEGY]: 'Legacy (independent placement)',
  ...Object.fromEntries(Object.entries(STRATEGIES).map(([k, s]) => [k, s.label]))
};

/**
 * The shape types each strategy places, for the shapes menu; null means all of them (the legacy generator, and any strategy
 * that does not say). Kept true by tests/strategyUses.test.js.
 * @type {Record<string, Set<string> | null>}
 */
export const STRATEGY_USES = {
  [DEFAULT_STRATEGY]: null,
  ...Object.fromEntries(Object.entries(STRATEGIES).map(([k, s]) => [k, s.uses ? new Set(s.uses) : null]))
};
