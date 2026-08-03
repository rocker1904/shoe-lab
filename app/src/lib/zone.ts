import { zoneOfKey, swapZone, type Zone } from './lineage';
import { defaultColumns, type ViewState } from './view';

/**
 * The zone a view is *about*, or null when it does not commit to one. Derived rather than stored,
 * exactly as the story mark is: a view that mixes zones is not wrong, it simply is not either
 * preset, and the toolbar marks neither (docs/app.md §Presets).
 */
export function zoneOf(v: ViewState): Zone | null {
  const used = new Set<Zone>();
  for (const key of [...v.columns, ...Object.keys(v.filters.ranges), v.sort.key]) {
    const zone = zoneOfKey(key);
    if (zone) used.add(zone);
  }
  return used.size === 1 ? [...used][0]! : null;
}

/**
 * Moves a view onto `zone`. Columns and the sort key carry no number — "sorted by energy return"
 * means the same thing on either half — so they follow; a bound on the half being left carries a
 * number that does not transfer (36 mm is median heel stack and the 98th percentile of forefoot),
 * so it is **dropped rather than translated**, and every zoneless filter is untouched.
 *
 * `rows` and `generations` need no attention, for the same reason in two forms: every zone-paired
 * key is curated, so a hand-added row can never name one (docs/app.md §Filters), and the declared
 * zone pairs resolve as `colocated` ahead of the catalogue's own links, so a zone key can never be
 * the current generation of a supersession either (docs/app.md §Model lineage).
 */
export function projectZone(v: ViewState, zone: Zone): ViewState {
  const next = structuredClone(v);
  next.sort = { ...v.sort, key: swapZone(v.sort.key, zone) };
  // Dedupe preserving order: a view can hold both halves of a pair, and both land on the same key.
  next.columns = [...new Set(v.columns.map((c) => swapZone(c, zone)))];
  for (const key of Object.keys(next.filters.ranges)) {
    const of = zoneOfKey(key);
    if (of !== null && of !== zone) delete next.filters.ranges[key];
  }
  // Everything above maps onto `zone`, so the only way to be unmarked here is to name no zone at
  // all. Left alone that makes the control a dead button — and one that has just silently dropped
  // a bound. Giving it that zone's measurements is the literal reading of what was clicked.
  if (zoneOf(next) === null) {
    next.columns = [...next.columns, ...defaultColumns(zone).filter((k) => zoneOfKey(k) !== null)];
  }
  return next;
}
