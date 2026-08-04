import { describe, expect, it } from 'vitest';
import { OVERSCAN_PX, virtualPlan, type VirtualEntry, type VirtualItem } from './virtual';

/**
 * **Asserted entry by entry, in order, and never by a total.** This branch has been bitten four
 * times by an assertion over an AGGREGATE surviving a REDISTRIBUTION — the most recent in
 * `app/e2e/fit-support.ts`, which carries the account — and a plan is the same shape of hazard: the
 * gaps always sum to the height of the items they replace, so a plan that puts every shoe in the
 * wrong place still totals the fleet. Every case below pins the whole array. The one aggregate here,
 * `auditPlan`, is a supplement and holds the grouping rather than the windowing.
 */

/** Distinct heights, so a gap's px names exactly one run of items and no count times an average. */
const HEIGHTS = [50, 60, 70, 80, 90, 100, 110, 120, 130, 140];
const FLEET: VirtualItem[] = HEIGHTS.map((height, i) => ({ key: `k${i}`, height }));
// Tops: 0, 50, 110, 180, 260, 350, 450, 560, 680, 810. Bottom of the fleet: 950.
const TOTAL = 950;

/**
 * The other fleets the audit sweep runs over, each carrying what `FLEET` cannot ask.
 *
 * `RAGGED` is zeros in the middle of the list, two of them adjacent, heights that repeat — so a
 * spacer's px stops naming exactly one run and the audit has to re-derive the run rather than
 * recognise the number — and a total of 142px, which is shorter than most of the viewports swept, so
 * the whole fleet sits inside the window at every scroll offset near it.
 */
const RAGGED: VirtualItem[] = [40, 0, 0, 40, 25, 25, 0, 12]
  .map((height, i) => ({ key: `r${i}`, height }));
const SOLO: VirtualItem[] = [{ key: 'only', height: 60 }];
const FLEETS: readonly (readonly [string, VirtualItem[]])[] = [
  ['ten distinct heights', FLEET], ['zeros, repeats and short', RAGGED], ['one shoe', SOLO],
  ['no shoes', []],
];

const item = (index: number): VirtualEntry => ({ kind: 'item', index });
const gap = (px: number): VirtualEntry => ({ kind: 'gap', px });
const sum = (from: number, to: number) => HEIGHTS.slice(from, to + 1).reduce((a, b) => a + b, 0);
const none = new Set<string>();

/**
 * The invariant that ties the cases together: the plan accounts for **every item exactly once, in
 * order**. Nothing is both rendered and inside a gap, nothing is missing, and each gap is the summed
 * height of exactly the run between the rendered items either side of it.
 *
 * It re-derives the grouping from the plan's OWN rendered indices, so it is not a second copy of the
 * function: which items are rendered is the windowing decision, which the exact-array cases pin, and
 * this holds the spacer arithmetic against whatever that decision was.
 */
function auditPlan(items: readonly VirtualItem[], plan: VirtualEntry[], at: string): void {
  let next = 0;
  plan.forEach((entry, i) => {
    if (entry.kind === 'item') {
      expect(entry.index, `${at}: items must arrive in document order with none skipped`).toBe(next);
      next++;
      return;
    }
    expect(plan[i - 1]?.kind, `${at}: two gaps in a row means one run was split`).not.toBe('gap');
    const following = plan.slice(i + 1).find((e) => e.kind === 'item');
    const end = following ? following.index : items.length;
    expect(end, `${at}: a gap stands for no items`).toBeGreaterThan(next);
    expect(entry.px, `${at}: a gap is not the summed height of what it replaces`)
      .toBe(items.slice(next, end).reduce((a, b) => a + b.height, 0));
    next = end;
  });
  expect(next, `${at}: the plan stopped short of the fleet`).toBe(items.length);
}

describe('virtualPlan', () => {
  it('renders every item and emits no spacer with no measured viewport', () => {
    // jsdom lays nothing out, and neither has this app before its first measured frame. Windowing on
    // a viewport of zero would leave a blank table wherever the measurement has not happened yet, so
    // a non-positive viewport is "cannot window" (spec §Failure behaviour). Asked with a scroll
    // offset far past the fleet, because that is the position a windowing answer would go blank at.
    for (const viewportPx of [0, -1, -10_000]) {
      const plan = virtualPlan(FLEET, 10_000, viewportPx, 0, none);
      expect(plan, `viewport ${viewportPx}`).toEqual(FLEET.map((_, i) => item(i)));
      auditPlan(FLEET, plan, `viewport ${viewportPx}`);
    }
  });

  it('plans nothing for an empty fleet, windowed or not', () => {
    // Not the same case as the fallback above: here there is a viewport and nothing to put in it,
    // and a spacer standing for no items would be a row the DOM has to carry for ever.
    expect(virtualPlan([], 0, 600, 100, none)).toEqual([]);
    expect(virtualPlan([], 300, 0, 0, new Set(['k0']))).toEqual([]);
  });

  it('brackets the visible run with one spacer above and one below', () => {
    // Window [300, 500]: item 3 ends at 260 and item 7 starts at 560, so 4-6 are what is on screen.
    const plan = virtualPlan(FLEET, 300, 200, 0, none);
    expect(plan).toEqual([gap(sum(0, 3)), item(4), item(5), item(6), gap(sum(7, 9))]);
    auditPlan(FLEET, plan, 'the visible run');
  });

  it('sizes a spacer by the heights it replaces, never by how many', () => {
    // Window [200, 500], which renders 3-6 and leaves a run of THREE items either side of it. The
    // two spacers differ by 210px on the same item count: a plan that multiplied a count by anything
    // would give them the same height and still total the fleet.
    const plan = virtualPlan(FLEET, 200, 300, 0, none);
    expect(plan).toEqual([gap(180), item(3), item(4), item(5), item(6), gap(390)]);
    expect(sum(0, 2)).toBe(180);
    expect(sum(7, 9)).toBe(390);
  });

  it('pulls in the neighbours the overscan reaches, at both ends', () => {
    // The same window grown by 100px each way reaches item 3 above and item 7 below. Scrolling up
    // has to be as cheap as scrolling down, so the margin is symmetric.
    const plan = virtualPlan(FLEET, 300, 200, 100, none);
    expect(plan)
      .toEqual([gap(sum(0, 2)), item(3), item(4), item(5), item(6), item(7), gap(sum(8, 9))]);
    auditPlan(FLEET, plan, 'overscan 100');
  });

  it('renders the whole fleet with no spacer once the overscan covers it', () => {
    const plan = virtualPlan(FLEET, 300, 200, 100_000, none);
    expect(plan).toEqual(FLEET.map((_, i) => item(i)));
  });

  it('renders an item whose bottom edge just touches the top of the window', () => {
    // Item 3 spans 180-260 and the window starts at exactly 260: it touches without overlapping,
    // which is the rule the module states. This is the only NON-DEGENERATE case of it — a
    // zero-height item exercises the same comparison with a box that has no extent to overlap with.
    const plan = virtualPlan(FLEET, 260, 200, 0, none);
    expect(plan).toEqual([gap(sum(0, 2)), item(3), item(4), item(5), item(6), gap(sum(7, 9))]);
    auditPlan(FLEET, plan, 'bottom edge on the window top');
  });

  it('renders an item whose top edge just touches the bottom of the window', () => {
    // The other half of the same rule: item 2 starts at exactly 110 and the window is [0, 110].
    const plan = virtualPlan(FLEET, 0, 110, 0, none);
    expect(plan).toEqual([item(0), item(1), item(2), gap(sum(3, 9))]);
    auditPlan(FLEET, plan, 'top edge on the window bottom');
  });

  it('keeps a claimed item next to the window without a zero-height spacer', () => {
    // Item 3 is the shoe immediately above the window — 40px clear of it, so it is not on screen —
    // and it is the runner's, expanded or focused. The hazard is a spacer emitted for the empty run
    // between it and item 4: a `<tr>` standing for no shoes, which nothing downstream can tell from
    // one that does.
    const plan = virtualPlan(FLEET, 300, 200, 0, new Set(['k3']));
    expect(plan).toEqual([gap(sum(0, 2)), item(3), item(4), item(5), item(6), gap(sum(7, 9))]);
    auditPlan(FLEET, plan, 'kept adjacent');
  });

  it('keeps consecutive claimed items with nothing between them', () => {
    // Two open rows next to each other, far above the window: the run between them is empty.
    const plan = virtualPlan(FLEET, 300, 200, 0, new Set(['k0', 'k1']));
    expect(plan)
      .toEqual([item(0), item(1), gap(sum(2, 3)), item(4), item(5), item(6), gap(sum(7, 9))]);
    auditPlan(FLEET, plan, 'consecutive kept');
  });

  it('keeps claimed items at both ends of the fleet, and starts and ends on them', () => {
    // The first and last shoe, which are the two positions where a spacer would be emitted for an
    // empty run at the edge of the plan rather than between two rendered rows.
    const plan = virtualPlan(FLEET, 300, 200, 0, new Set(['k0', 'k9']));
    expect(plan).toEqual([
      item(0), gap(sum(1, 3)), item(4), item(5), item(6), gap(sum(7, 8)), item(9),
    ]);
    auditPlan(FLEET, plan, 'kept at both ends');
  });

  it('keeps a claimed item in the plan at every scroll position there is', () => {
    // The bound this exists for: an expanded row and the focused row survive scrolling past them
    // (spec §Decisions, the window is what is on screen plus what the runner has claimed). Asked
    // above the fleet, inside it and past its end, since each is a different branch of the window.
    const kept = new Set(['k0', 'k9']);
    for (const scrollTop of [-5_000, -40, 0, 137, 300, 949, 10_000]) {
      const plan = virtualPlan(FLEET, scrollTop, 200, 0, kept);
      const rendered = plan.filter((e) => e.kind === 'item').map((e) => e.index);
      expect(rendered, `at ${scrollTop}`).toContain(0);
      expect(rendered, `at ${scrollTop}`).toContain(9);
      auditPlan(FLEET, plan, `kept at ${scrollTop}`);
    }
  });

  it('renders everything and spaces nothing when every item is claimed', () => {
    const plan = virtualPlan(FLEET, 10_000, 200, 0, new Set(FLEET.map((s) => s.key)));
    expect(plan).toEqual(FLEET.map((_, i) => item(i)));
  });

  it('spaces the whole fleet in one row when the scroll is past its end', () => {
    // One spacer, and its height is the fleet's — the state the scrollbar has to keep agreeing with
    // while nothing is rendered.
    const plan = virtualPlan(FLEET, 10_000, 200, 0, none);
    expect(plan).toEqual([gap(TOTAL)]);
    expect(TOTAL).toBe(sum(0, 9));
  });

  it('splits that spacer around a claimed item past the end', () => {
    const plan = virtualPlan(FLEET, 10_000, 200, 0, new Set(['k5']));
    expect(plan).toEqual([gap(sum(0, 4)), item(5), gap(sum(6, 9))]);
    auditPlan(FLEET, plan, 'kept past the end');
  });

  it('renders the top of the fleet when the scroll offset is negative', () => {
    // Overscroll — the rubber band at the top of the document, and the state a caller subtracting
    // the body's offset lands in for a frame. The window is [-40, 160], so the top three shoes are
    // on screen and are what a runner sees.
    const plan = virtualPlan(FLEET, -40, 200, 0, none);
    expect(plan).toEqual([item(0), item(1), item(2), gap(sum(3, 9))]);
    auditPlan(FLEET, plan, 'negative scroll');
  });

  it('spaces the fleet when the scroll offset is negative past the viewport', () => {
    // Taken literally rather than clamped: the window is above the content, so nothing is on screen
    // and the honest plan is the same one the far end gives. Clamping to zero would render the top
    // of the fleet at a position no runner is looking at, and would hide a caller that had
    // subtracted the wrong offset.
    expect(virtualPlan(FLEET, -5_000, 200, 0, none)).toEqual([gap(TOTAL)]);
  });

  it('places zero-height items by where they sit, and still accounts for them', () => {
    // A degenerate box passes through a strict overlap test at every position, so without the
    // touching rule a zero-height item would be in no part of the plan. No height source in the tree
    // produces one today — this is what makes the function total over the contract rather than over
    // today's callers. Window [0, 50]: the two at the top and the 100px one render; the two sitting
    // at 100 do not, and the spacer standing for them is 0px rather than absent.
    const flat: VirtualItem[] = [
      { key: 'z0', height: 0 }, { key: 'z1', height: 0 }, { key: 'z2', height: 100 },
      { key: 'z3', height: 0 }, { key: 'z4', height: 0 },
    ];
    const plan = virtualPlan(flat, 0, 50, 0, none);
    expect(plan).toEqual([item(0), item(1), item(2), gap(0)]);
    auditPlan(flat, plan, 'zero heights');
  });

  it('renders a fleet of nothing but zero-height items', () => {
    const flat: VirtualItem[] = ['z0', 'z1', 'z2'].map((key) => ({ key, height: 0 }));
    expect(virtualPlan(flat, 0, 600, 0, none)).toEqual([item(0), item(1), item(2)]);
    // Past the end of a fleet with no extent: every item is at 0 and the window is not.
    expect(virtualPlan(flat, 600, 600, 0, none)).toEqual([gap(0)]);
  });

  /**
   * The overscan's own bound, in the units the constant is written in. §Bounds asks for it here, and
   * the number's derivation — what it was measured against and why a jump is not covered by it —
   * lives in `virtual.ts` beside the constant, which is its one home.
   *
   * **A fleet of 1px shoes, so a rendered INDEX is a distance in px.** Anything taller makes the
   * assertion a row count that happens to agree with the constant at one height, which is the shape
   * of claim this branch has been wrong about before.
   *
   * **And the distance is spelled out here rather than read from `OVERSCAN_PX`.** The first shape of
   * this wrote every edge in terms of the constant it was bounding, which is not a bound at all:
   * `OVERSCAN_PX` 1280 → 640 left it green, and the §Bounds row's number was held by nothing. The
   * local below is a SECOND, independent spelling of that row. If the constant ever moves, this is
   * re-derived from `.hunt/task6/overscan.ts` and the derivation in `virtual.ts` rewritten with it —
   * never edited to agree.
   */
  it('reaches 1,280px past the window, at both ends and no further', () => {
    const BOUND_PX = 1280;
    const fine: VirtualItem[] = Array.from({ length: 4000 }, (_, i) => ({ key: `p${i}`, height: 1 }));
    const rendered = virtualPlan(fine, 2000, 100, OVERSCAN_PX, none)
      .flatMap((e) => (e.kind === 'item' ? [e.index] : []));
    // The window is [2000 − 1280, 2000 + 100 + 1280]. The first rendered shoe is the one whose
    // BOTTOM touches the window's top — index n spans n..n+1 — which is one lower than the edge
    // itself; the last is the one whose top touches the bottom, which is the edge exactly.
    expect(rendered[0], 'the window does not reach 1,280px above the viewport')
      .toBe(2000 - BOUND_PX - 1);
    expect(rendered.at(-1), 'the window does not reach 1,280px below the viewport')
      .toBe(2000 + 100 + BOUND_PX);
    // And nothing outside that run, so this is the window rather than a lower bound on it.
    expect(rendered).toHaveLength(2 * BOUND_PX + 102);
  });

  /**
   * **The one figure in the cost record that is a property rather than a reading.** What a held grip
   * pays for is the rows it re-renders, and the whole claim of this change is that the body's size is
   * a function of the viewport and the overscan and of nothing else — so it does not grow when
   * upstream publishes another two hundred shoes. That is arithmetic, it is deterministic, and it
   * belongs in the suite.
   *
   * **The milliseconds either side of it do not** (docs/app.md §What a drag may recompute). They are
   * hardware, and the spread on one quiet machine is already a tenth of the median and a fifth of the
   * worst step; a wall-clock bound on CI would be a flake rather than a guard, and the e2e fixture is
   * five shoes, so a cost measured there would be the cost of five names. They are re-measured by a
   * rig on the committed fleet and recorded in the doc that owns them.
   *
   * A viewport of 900 over 36px shoes — the fleet's modal row — gives a window of 900 + 2×1,280 =
   * 3,460px, and 9,000px in that is [7,720, 11,180], which touches 97 rows. Written out rather than
   * derived from `OVERSCAN_PX`, for the reason the overscan's own bound above is; and the count is
   * the one this offset gives rather than a constant of the window, since a window whose edges land
   * exactly on two boundaries touches a row more.
   */
  it('renders a window sized by the viewport and the overscan, whatever the fleet', () => {
    const uniform = (n: number) => Array.from({ length: n }, (_, i) => ({ key: `u${i}`, height: 36 }));
    const rendered = (n: number) => virtualPlan(uniform(n), 9_000, 900, OVERSCAN_PX, none)
      .filter((e) => e.kind === 'item').length;
    expect(rendered(455)).toBe(97);
    for (const fleet of [4_550, 45_500]) {
      expect(rendered(fleet), `the body grows with the fleet: ${fleet} shoes`).toBe(rendered(455));
    }
  });

  it('accounts for every item exactly once, across every combination there is', () => {
    // The supplement, and the only place a sweep appears: the cases above pin what the window
    // decides, this holds the grouping and the arithmetic against whatever it decided.
    //
    // **Over more than one FLEET, and that is the whole strength of it.** Swept over the ten
    // distinct positive heights alone, this missed a mutation that loses items outright — flushing
    // the spacer on its px rather than on whether it stands for anything, which reads like the same
    // sentence and is not. The plan it produced dropped a run of zero-height shoes into no part of
    // the plan at all. It escaped because the sweep varied the scroll offset, the viewport, the
    // overscan and the kept set and held the fleet fixed: the one axis the audit is strongest on was
    // the one never varied. So the fleets vary too, and they are chosen for what the first cannot
    // ask — interior zeros, a run of two of them, repeated heights so a spacer's px no longer names
    // exactly one run, a fleet shorter than the viewport, one of a single shoe, and one of none.
    for (const [fleetName, fleet] of FLEETS) {
      const keys = fleet.map((s) => s.key);
      // Derived from the fleet rather than written out, or a second fleet would be swept with a kept
      // set naming nothing in it — which is the sweep looking wider while asking less.
      const kepts = [none, new Set(keys.slice(0, 1)), new Set(keys.slice(3, 5)), new Set(keys)];
      for (const scrollTop of [-5_000, -40, 0, 41, 137, 300, 949, 10_000]) {
        for (const viewportPx of [1, 200, 100_000]) {
          for (const overscanPx of [0, 25, 100_000]) {
            for (const kept of kepts) {
              const at = `${fleetName} @ ${scrollTop}/${viewportPx}/${overscanPx}/`
                + `${[...kept].join('+') || '-'}`;
              auditPlan(fleet, virtualPlan(fleet, scrollTop, viewportPx, overscanPx, kept), at);
            }
          }
        }
      }
    }
  });
});
