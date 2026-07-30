import { sideOfKey, swapSide, type Side } from './lineage';
import { defaultColumns, type ViewState } from './urlstate';

/**
 * The side a view is *about*, or null when it does not commit to one. Derived rather than stored,
 * exactly as the story mark is: a view that mixes sides is not wrong, it simply is not either
 * preset, and the toolbar marks neither (docs/app.md §Presets).
 */
export function sideOf(v: ViewState): Side | null {
  const used = new Set<Side>();
  for (const key of [...v.columns, ...Object.keys(v.filters.ranges), v.sort.key]) {
    const side = sideOfKey(key);
    if (side) used.add(side);
  }
  return used.size === 1 ? [...used][0]! : null;
}

/**
 * Moves a view onto `side`. Columns and the sort key carry no number — "sorted by energy return"
 * means the same thing on either half — so they follow; a bound on the half being left carries a
 * number that does not transfer (36 mm is median heel stack and the 98th percentile of forefoot),
 * so it is **dropped rather than translated**, and every sideless filter is untouched.
 *
 * `rows` and `generations` need no attention, for the same reason in two forms: every side-paired
 * key is curated, so a hand-added row can never name one (docs/app.md §Filters), and the declared
 * side pairs resolve as `colocated` ahead of the catalogue's own links, so a side key can never be
 * the current generation of a supersession either (docs/app.md §Model lineage).
 */
export function projectSide(v: ViewState, side: Side): ViewState {
  const next = structuredClone(v);
  next.sort = { ...v.sort, key: swapSide(v.sort.key, side) };
  // Dedupe preserving order: a view can hold both halves of a pair, and both land on the same key.
  next.columns = [...new Set(v.columns.map((c) => swapSide(c, side)))];
  for (const key of Object.keys(next.filters.ranges)) {
    const of = sideOfKey(key);
    if (of !== null && of !== side) delete next.filters.ranges[key];
  }
  // Everything above maps onto `side`, so the only way to be unmarked here is to name no side at
  // all. Left alone that makes the control a dead button — and one that has just silently dropped
  // a bound. Giving it that side's measurements is the literal reading of what was clicked.
  if (sideOf(next) === null) {
    next.columns = [...next.columns, ...defaultColumns(side).filter((k) => sideOfKey(k) !== null)];
  }
  return next;
}
