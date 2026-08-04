import { describe, expect, it } from 'vitest';
import { virtualPlan, type VirtualEntry, type VirtualItem } from './virtual';

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

  it('keeps a claimed item next to the window without a zero-height spacer', () => {
    // Item 3 ends exactly where the window starts and is the runner's — expanded or focused. The
    // hazard is a spacer emitted for the empty run between it and item 4: a `<tr>` standing for no
    // shoes, which nothing downstream can distinguish from one that does.
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
    // A shoe can measure zero — `row-height.ts` answers for a fleet mid-face-swap — and a zero-height
    // box passes through a strict overlap test at every position. Window [0, 50]: the two at the top
    // and the 100px one render; the two sitting at 100 do not, and the spacer standing for them is
    // 0px rather than absent, or they would be in no part of the plan at all.
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

  it('accounts for every item exactly once, across every combination there is', () => {
    // The supplement, and the only place a sweep appears: the cases above pin what the window
    // decides, this holds the grouping and the arithmetic against whatever it decided.
    const kepts = [none, new Set(['k0']), new Set(['k4', 'k5']), new Set(FLEET.map((s) => s.key))];
    for (const scrollTop of [-5_000, -40, 0, 137, 300, 949, 10_000]) {
      for (const viewportPx of [1, 200, 100_000]) {
        for (const overscanPx of [0, 25, 100_000]) {
          for (const kept of kepts) {
            const at = `${scrollTop}/${viewportPx}/${overscanPx}/${[...kept].join('+') || '-'}`;
            auditPlan(FLEET, virtualPlan(FLEET, scrollTop, viewportPx, overscanPx, kept), at);
          }
        }
      }
    }
  });
});
