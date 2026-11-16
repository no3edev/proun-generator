// @ts-check

// Which shape on screen becomes which shape of the next composition.
//
// A composition strategy decides how many of each shape a scene has, so the
// number differs from one composition to the next: some shapes of the old
// scene have no counterpart in the new one, and some of the new have none in
// the old. Matching each old shape to the new one that suits it best lets as
// many as possible glide, and the rest leave (shrink away) or arrive (grow in)
// instead of popping.
//
// Shapes only ever pair with a shape of the same type (a beam cannot become a
// circle: the geometry differs). Within a type, a shape first goes to the new
// shape with the same ROLE that is nearest to it (the old beam of the main
// angle becomes the new one), then, if shapes are left over on both sides,
// to the nearest of the same type whatever its role. Anything still unpaired
// leaves or arrives. Pure and deterministic (ties break by index).

/**
 * @typedef {Object} Ref
 * @property {string} type
 * @property {string | undefined} role   undefined for a legacy shape (it has none)
 * @property {ArrayLike<number>} position  x, y, z in the scene
 */

/**
 * @param {Ref[]} olds the shapes on screen (their position being where they are headed)
 * @param {Ref[]} news the shapes of the new composition
 * @returns {{ pairs: Array<{ old: number, next: number }>, leaving: number[], arriving: number[] }}
 *          indexes into `olds` / `news`; pairs are ordered by `next`
 */
export function matchInstances(olds, news) {
  const usedOld = new Set();
  const usedNew = new Set();
  /** @type {Array<{ old: number, next: number }>} */
  const pairs = [];
  const dist2 = (/** @type {Ref} */ a, /** @type {Ref} */ b) => {
    const dx = a.position[0] - b.position[0], dy = a.position[1] - b.position[1], dz = a.position[2] - b.position[2];
    return dx * dx + dy * dy + dz * dz;
  };

  const types = new Set([...olds.map((o) => o.type), ...news.map((n) => n.type)]);
  for (const type of types) {
    const O = olds.flatMap((o, i) => (o.type === type ? [i] : []));
    const N = news.flatMap((n, i) => (n.type === type ? [i] : []));
    for (const sameRole of [true, false]) {
      /** @type {Array<{ o: number, n: number, d: number }>} */
      const cands = [];
      for (const o of O) {
        if (usedOld.has(o)) continue;
        for (const n of N) {
          if (usedNew.has(n)) continue;
          if (sameRole && olds[o].role !== news[n].role) continue;
          cands.push({ o, n, d: dist2(olds[o], news[n]) });
        }
      }
      cands.sort((a, b) => a.d - b.d || a.o - b.o || a.n - b.n);
      for (const c of cands) {
        if (usedOld.has(c.o) || usedNew.has(c.n)) continue;
        usedOld.add(c.o);
        usedNew.add(c.n);
        pairs.push({ old: c.o, next: c.n });
      }
    }
  }
  pairs.sort((a, b) => a.next - b.next);
  return {
    pairs,
    leaving: olds.flatMap((_, i) => (usedOld.has(i) ? [] : [i])),
    arriving: news.flatMap((_, i) => (usedNew.has(i) ? [] : [i]))
  };
}
