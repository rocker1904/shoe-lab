import { expect, test, type Page } from '@playwright/test';
import { APP_FACES, awaitFacesLoaded, settledDeclared } from './fit-support';

/**
 * **The one file that runs against a body that is actually windowed.**
 *
 * Nothing else can. The e2e fixture is five shoes — about 180px — against 1,280px of overscan at
 * each end, so no viewport and no arrangement of open panels can put a shoe outside the window:
 * `smoke.spec.ts` and `cross-browser.spec.ts` say so in their own words, and `fit-support.ts`
 * asserts it, which is right for what those protect. It also meant that every guard this change
 * most needs was unreachable, and ten mutations at the seam between the plan and the DOM survived
 * the whole suite (`.delivery/2026-08-03-virtualising-the-table/task-6-review.md`, F1).
 *
 * So this file routes its own fleet, for its own tests only. Every count in every other file is
 * untouched, and the fixture's `spacers === 0` assertions stay true rather than being loosened —
 * they are true of five shoes, and the point is that this is not five shoes.
 *
 * Chromium only, which the project config already decides: this measures layout and a11y structure,
 * and the three-engine files are the filters and the Features section
 * (`playwright.config.ts`). The engine-by-engine half of the window — that every row renders at the
 * height it was measured at — is `cross-browser.spec.ts`.
 */

/** Enough shoes that the window is a small fraction of them, so a spacer is never a rounding error
 *  and the fleet's own row numbers are nowhere near the DOM's. */
const FLEET_SIZE = 400;

/**
 * The fixture's own shoes, repeated until there are enough of them to window, with a distinct slug
 * and name each. Built from the fixture rather than invented so that every value, reading and
 * detail the app renders is one the rest of the suite already trusts — what changes is only how
 * many there are. One name in three is long enough to wrap the name column, so the fleet's rows are
 * not all one height and a spacer's px is a real sum rather than a multiple.
 *
 * Built once and held, because a test may navigate more than once: `route.fetch()` reads through to
 * the preview server and its response belongs to the navigation that asked for it, so fetching
 * again on a second `goto` disposes the first rather than answering it.
 */
async function routeBigFleet(page: Page): Promise<void> {
  let payload: Record<string, unknown> | null = null;
  await page.route('**/shoes.json*', async (route) => {
    if (!payload) {
      const file = await (await route.fetch()).json() as
        { shoes: { slug: string; name: string }[] } & Record<string, unknown>;
      const shoes = Array.from({ length: FLEET_SIZE }, (_, i) => {
        const base = file.shoes[i % file.shoes.length]!;
        const suffix = ['', ' Continental Ultraride Edition', ' Pro'][i % 3];
        return { ...base, slug: `${base.slug}-${i}`, name: `${base.name} ${i}${suffix}` };
      });
      payload = { ...file, shoes };
    }
    await route.fulfill({ json: payload });
  });
}

/** Everything a plan can be read off the page as. Heights come off the boxes rather than off the
 *  declared `style`, because what a spacer is *given* and what it *occupies* differing by the
 *  cell's own padding is one of the things this file exists to catch. */
async function readPlanNow(page: Page) {
  return page.evaluate(() => {
    const table = document.querySelector('.tblwrap table:not(.proto)')!;
    const body = table.querySelector('tbody')!;
    const spacers = [...body.querySelectorAll('tr.spacer')];
    const rows = [...body.querySelectorAll<HTMLElement>('tr.shoe')];
    return {
      rowcount: Number(table.getAttribute('aria-rowcount')),
      shoes: rows.length,
      panels: body.querySelectorAll('tr.expand').length,
      spacers: spacers.length,
      spacerPx: spacers.reduce((total, s) => total + s.getBoundingClientRect().height, 0),
      bodyPx: body.getBoundingClientRect().height,
      first: Number(rows[0]?.getAttribute('aria-rowindex') ?? 0),
      slugs: rows.map((r) => r.dataset['slug']!),
      // Every bucket a row is painted in, in column order: the wash is one class per cell and
      // carries no value at all, so the class IS the colour (docs/app.md §Theming).
      wash: Object.fromEntries(rows.map((r) => [r.dataset['slug']!,
        [...r.querySelectorAll('td.num')]
          .flatMap((c) => [...c.classList].filter((x) => /^w-[bmg]-\d+$/.test(x))).join(' ')])),
    };
  });
}

type Plan = Awaited<ReturnType<typeof readPlanNow>>;

/**
 * **The plan, read only once it has stopped moving — and every read below goes through this.**
 *
 * A plan is not settled the moment the gesture that changed it returns. Opening a panel is the case
 * that proves it: the row's own height changes when `panelPx` arrives, and that arrives through a
 * `ResizeObserver` a frame or two after the click, so the window re-cuts from 97 rendered shoes to
 * 93 *after* the panel is in the DOM. A snapshot taken on the near side of that delivery is a
 * number that was true and is not any more, and an assertion polling a locator against it fails on
 * whichever machine is fast enough to lose the race — measured at 4 failures in 8 isolated runs,
 * invisible under the parallel suite because the extra load lets the delivery land first.
 *
 * Two consecutive agreeing reads, rather than a wait of any length: a duration is a guess about a
 * machine and this is a claim about the page.
 */
async function plan(page: Page): Promise<Plan> {
  let last: Plan | null = null;
  await expect.poll(async () => {
    const next = await readPlanNow(page);
    const same = last !== null && JSON.stringify(last) === JSON.stringify(next);
    last = next;
    return same;
  }, { message: 'the plan never stopped moving' }).toBe(true);
  return last!;
}

/** The table settled at a width, on a fleet big enough to window. */
async function mount(page: Page, width = 1440): Promise<void> {
  await page.setViewportSize({ width, height: 900 });
  await routeBigFleet(page);
  await page.goto('/');
  await awaitFacesLoaded(page, { required: APP_FACES });
  await settledDeclared(page, 'before reading the plan');
  await expect(page.locator('.tblwrap tbody tr.spacer').first(),
    'the fleet routed for this file does not window, so nothing here is a claim about a window')
    .toBeAttached();
  // **The setup strip is spent before anything is read.** A bare arrival draws it and the first
  // scroll of the session takes it away (docs/app.md §The setup strip), so the document gets ~153px
  // shorter under that gesture and the scroll lands short by the difference. Pre-existing app
  // behaviour, identical on the un-windowed build, and nothing to do with the plan — but left in, it
  // makes the first two positions this file reads the SAME position, which is a windowing test
  // comparing a window with itself.
  await scrollTo(page, 600);
  await scrollTo(page, 0);
}

/**
 * Scrolls, and does not return until the page has STAYED where it was put for two frames — which is
 * also long enough for the plan the scroll asked for, applied in the same frame in every engine a
 * rig can drive (`src/lib/virtual.ts`).
 *
 * **Re-issued rather than trusted**, because a document that shortens under the gesture clamps the
 * landing after the call has already returned. Asserting where it came to rest is what makes every
 * position below a position rather than a request.
 */
async function scrollTo(page: Page, y: number): Promise<void> {
  await expect.poll(async () => {
    await page.evaluate((to) => window.scrollTo(0, to), y);
    await page.waitForFunction(() => new Promise<boolean>((resolve) =>
      requestAnimationFrame(() => requestAnimationFrame(() => resolve(true)))));
    return page.evaluate((to) => {
      const max = document.documentElement.scrollHeight - window.innerHeight;
      return Math.abs(window.scrollY - Math.min(to, max)) <= 1;
    }, y);
  }, { message: `the page never came to rest at ${y}px` }).toBe(true);
}

/**
 * **A spacer stands for exactly the shoes it replaces**, which is what keeps the scrollbar meaning
 * the same thing windowed as it did rendering all 400. The cell takes back the `--s2` padding and
 * the 1px bottom border every other `td` is given, so an unreset spacer stands 17px above its run —
 * every spacer, not only a 0px one — and the body then grows and shrinks by 17px as kept shoes split
 * one spacer into two.
 *
 * The body's own height is what says it: it is a fact about the whole plan, invariant to where the
 * runner is looking, and 42 scroll positions in two engines put it at 0.00px of spread on the real
 * fleet (`.hunt/review12/probe-c.ts`).
 */
test('holds the body to one height however the plan is cut', async ({ page }) => {
  await mount(page);
  const rest = await plan(page);
  expect(rest.shoes, 'the body is not windowed').toBeLessThan(FLEET_SIZE);
  expect(rest.rowcount, 'aria-rowcount is not the header plus the whole fleet')
    .toBe(1 + FLEET_SIZE);

  const seen: { at: number; plan: Plan }[] = [];
  const bottom = await page.evaluate(() => document.documentElement.scrollHeight);
  for (const at of [0, 3_000, Math.round(bottom / 2), bottom]) {
    await scrollTo(page, at);
    seen.push({ at, plan: await plan(page) });
  }
  // The cut has to actually vary, or the invariant below holds vacuously: a plan taken from the
  // middle is spacer-shoes-spacer where one taken from either end is a single spacer.
  expect(Math.max(...seen.map((s) => s.plan.spacers)),
    'no scroll position splits the fleet in two, so nothing here exercises a pair of spacers')
    .toBe(2);
  const heights = seen.map((s) => s.plan.bodyPx);
  expect(Math.max(...heights) - Math.min(...heights),
    `the body changes height with the scroll position: ${JSON.stringify(seen.map((s) => [s.at, s.plan.bodyPx, s.plan.spacers]))}`)
    .toBeLessThanOrEqual(0.5);

  // And the plan is a window rather than the fleet at every one of them, with the rows' own numbers
  // coming from the fleet rather than from the DOM: halfway down, the first row in the `<tbody>` is
  // a couple of hundred rows into the table it says it is part of.
  const deep = seen.at(-2)!.plan;
  expect(deep.shoes).toBeLessThan(FLEET_SIZE / 2);
  expect(deep.first, 'the row numbers are the DOM positions rather than the fleet positions')
    .toBeGreaterThan(FLEET_SIZE / 4);
});

/**
 * **A row that stands for rows is not one.** Without `aria-hidden` the tree gains a row per spacer,
 * and the argument for keeping a semantic `<table>` — which is what forces every hard part of this
 * change — partly defeats itself. The positions the tree loses with them ride on `aria-rowcount`
 * and `aria-rowindex` instead, which the test above holds.
 *
 * Read through `getByRole`, so this is Chromium's own view of the table rather than the attribute
 * spelled back at itself.
 */
test('keeps the spacers out of the accessibility tree', async ({ page }) => {
  await mount(page);
  await scrollTo(page, 6_000);
  const shut = await plan(page);
  expect(shut.spacers, 'no spacer exists here, so its absence from the tree proves nothing')
    .toBeGreaterThan(0);
  await expect(page.getByRole('row'), 'a spacer reached the accessibility tree')
    .toHaveCount(shut.shoes + shut.panels + 1);

  // The same claim with a panel open, which is the case where the tree has rows a spacer sits
  // between rather than only after. The plan is read only once it has settled: opening a panel
  // re-cuts the window a frame or two later, when the panel's own height arrives.
  await page.locator('tr.shoe').first().click();
  await expect(page.locator('tr.expand')).toHaveCount(1);
  const open = await plan(page);
  expect(open.spacers).toBeGreaterThan(0);
  await expect(page.getByRole('row'), 'a spacer reached the accessibility tree beside a panel')
    .toHaveCount(open.shoes + open.panels + 1);
});

/**
 * **The focused row is pinned rather than surrendered.** A shoe row is `tabindex="0"` and is the
 * control that expands it; unmounting it while it holds focus drops `activeElement` to `<body>`, so
 * there is no ring anywhere and the next Tab restarts from the top of the document past every
 * filter (spec §Decisions, docs/policies.md §Interaction chrome).
 *
 * Scrolled to the far end of the fleet, which is well past both the window and the overscan.
 */
test('keeps the focused row in the plan wherever it scrolls to', async ({ page }) => {
  await mount(page);
  await scrollTo(page, 4_000);
  const slug = (await plan(page)).slugs[3]!;
  await page.locator(`tr.shoe[data-slug="${slug}"]`).focus();
  await expect(page.locator('tr.shoe:focus')).toHaveCount(1);

  await scrollTo(page, await page.evaluate(() => document.documentElement.scrollHeight));
  await expect(page.locator(`tr.shoe[data-slug="${slug}"]`),
    'the focused row was unmounted, which drops the ring to the document')
    .toHaveCount(1);
  expect(await page.evaluate(() =>
    (document.activeElement as HTMLElement | null)?.dataset['slug'] ?? null),
  'focus left the row it was on').toBe(slug);
  // **And it is kept rather than merely still on screen**, which is what makes the assertion above
  // mean anything: a row the plan holds against the window sits alone BETWEEN two spacers, at the
  // place in the document its own scroll position gives it. A `<tr>` cannot be taken out of flow, so
  // the spacer above it is the only thing that can put it where the scrollbar says it is.
  const around = await page.evaluate((s) => {
    const row = document.querySelector(`tr.shoe[data-slug="${s}"]`)!;
    return { before: row.previousElementSibling?.className ?? '',
             after: row.nextElementSibling?.className ?? '' };
  }, slug);
  expect(around.before, 'the focused row is still inside the window, so nothing kept it')
    .toContain('spacer');
  expect(around.after, 'the focused row is still inside the window, so nothing kept it')
    .toContain('spacer');
});

/**
 * **The wash ranks over the whole filtered set, never over the plan** (spec §Non-goals). Ranked over
 * what is on screen, a cell's tint would mean something different from its neighbours' in the same
 * row and something different again at every scroll position — the same shoe repainting as the
 * runner scrolls past it.
 *
 * Two windows with an overlap, so the claim is about the shoes in both rather than about a formula
 * restated here — and it is the cross-window comparison that discriminates, verified against the
 * honest form of the defect: ranking over `plan` rather than over `shoes` reddens this with
 * "cushy-145 is painted differently from one scroll position to the next". The bluntest spelling of
 * the mutation — ranking over a slice of the fleet — leaves most shoes with no percentile at all
 * and trips the sentinel below first, which is a coarser reason than the one this test is for.
 */
test('paints a shoe the same wherever the window is', async ({ page }) => {
  await mount(page);
  await scrollTo(page, 6_000);
  const before = await plan(page);
  await scrollTo(page, 6_600);
  const after = await plan(page);

  const shared = before.slugs.filter((s) => after.slugs.includes(s));
  expect(shared.length, 'the two windows do not overlap, so nothing is compared').toBeGreaterThan(5);
  expect(before.slugs).not.toEqual(after.slugs);
  for (const slug of shared) {
    expect(before.wash[slug], `${slug} carries no bucket at all`).not.toBe('');
    expect(after.wash[slug], `${slug} is painted differently from one scroll position to the next`)
      .toBe(before.wash[slug]);
  }
});




/**
 * **A table that cannot measure renders everything, and the runner keeps their place**
 * (spec §Failure behaviour). `null` from the row measurement means *cannot measure*, never *every
 * row is 0px tall*, and the caller states it by handing `virtualPlan` a viewport of zero — which
 * that function already owns as "render every item, space for nothing".
 *
 * **The path that reaches it is a rendering swap, not a reload.** A reload cannot: the app fetches
 * its data after mount, so the engine's scroll restoration clamps to the top before the table
 * exists — measured, `scrollY` is 0 across 180 sampled frames. But the app mounts ONE of two
 * renderings and swaps between them (docs/app.md §Two renderings, and only one of them mounted), so
 * the desktop table can mount fresh at any scroll position the phone list was left at — rotating a
 * tablet, dragging a window wider, or ticking a column at a width that never moved.
 *
 * Measured, at 390px scrolled to 12,000 and resized to 1440: the desktop document is shorter than
 * the stacked list's, so the engine clamps to 11,360 and the table mounts windowed there, 90 rows
 * over 2 spacers. Without the fallback the fleet has zero measured height at a body offset of
 * 11,156px, the window selects nothing at all, the document collapses to its chrome and the engine
 * clamps the scroll to **0**: the runner is thrown back to the top of the fleet and loses their
 * place. Nothing blank is painted — the collapse and the re-measurement happen inside one frame —
 * which is why an instrument that counts blank frames never saw this.
 */
test('keeps the runner where they were when the rendering swaps under them', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 900 });
  await routeBigFleet(page);
  await page.goto('/');
  await expect(page.getByTestId('shoe-table-mobile'),
    'the stacked list is not mounted, so nothing here swaps').toBeVisible();
  await scrollTo(page, 12_000);

  await page.setViewportSize({ width: 1440, height: 900 });
  await expect(page.locator('.tblwrap'), 'the desktop table never mounted').toHaveCount(1);
  await settledDeclared(page, 'after the rendering swapped');
  const swapped = await plan(page);
  const at = await page.evaluate(() => ({
    y: window.scrollY,
    max: document.documentElement.scrollHeight - window.innerHeight,
  }));

  // Within a screenful of where the gesture left them, or clamped by the shorter document — the
  // desktop rendering is more compact than the stacked list, so some clamping is the honest answer
  // and losing the position entirely is not.
  expect(at.y, `the swap threw the runner back up the fleet, to ${at.y}px`)
    .toBeGreaterThan(Math.min(12_000, at.max) - 900);
  // And it mounted WINDOWED there rather than showing the top of the fleet: the rows on screen are
  // the ones the scroll position names.
  expect(swapped.first, 'the table mounted at the top of the fleet rather than where the page is')
    .toBeGreaterThan(FLEET_SIZE / 4);
  expect(swapped.shoes).toBeLessThan(FLEET_SIZE);
});


/**
 * **What an open shoe occupies is a row PLUS its panel, and the plan has to believe it.**
 *
 * A panel is 843–1005px on the desktop. Left out of the item's height, every shoe below an open one
 * sits that much further down the document than the plan believes, so the window computed for a
 * scroll position past it selects rows that are nowhere near the screen — which is why the
 * component measures the panel off the DOM rather than modelling it, and it is what
 * `ShoeTable.svelte` calls "a blank body rather than a subtle error" in its own words.
 *
 * **The instrument is what a runner would see**, not an offset: sample down the middle of the table
 * and ask what is under each point. Measured with six panels open above the window, at three depths:
 * clean, **29 of 29 points land on shoe rows and none on a spacer**; with the panel height dropped
 * from the item, **29 of 29 land on a spacer** — the whole viewport is the stand-in for rows that
 * are elsewhere in the DOM. One open panel is inside the 1,280px overscan and invisible; the error
 * is per open panel, so it is a defect that arrives with the comparison the app exists for.
 *
 * It holds the other half of the same rule too: **an open row is in the plan at any scroll
 * position** (spec §Decisions), asserted as the six panels still being mounted a fleet away from
 * where they were opened.
 */
test('never leaves the runner looking at a spacer, with panels open above them', async ({ page }) => {
  await mount(page);
  // Opened through the address rather than by clicking, because a click also scrolls: the landing
  // is `toggle`'s job and this test is about the plan (docs/app.md §View and URL ownership).
  const opened = (await plan(page)).slugs.slice(0, 6);
  await page.goto(`/?open=${opened.join(',')}`);
  await expect(page.locator('.tblwrap'), 'the desktop table never mounted').toHaveCount(1);
  await settledDeclared(page, 'with panels open');
  await expect(page.locator('tr.expand'), 'an open row was left out of the plan')
    .toHaveCount(opened.length);

  for (const y of [6_000, 10_000, 14_000]) {
    await scrollTo(page, y);
    const cut = await plan(page);
    expect(cut.spacers, `nothing is spaced for at ${y}px, so this asserts nothing`)
      .toBeGreaterThan(0);
    expect(cut.panels, `an open row was dropped from the plan at ${y}px`).toBe(opened.length);

    const under = await page.evaluate(() => {
      const wrap = document.querySelector('.tblwrap')!.getBoundingClientRect();
      const x = Math.round(wrap.left + wrap.width / 2);
      const hits: Record<string, number> = {};
      for (let sample = 0; sample <= window.innerHeight; sample += 25) {
        const tr = document.elementFromPoint(x, sample)?.closest('tr');
        // The pinned header and the page outside the table are neither: what matters is that no
        // point inside the body is standing on a spacer.
        const kind = !tr ? 'none' : tr.closest('thead') ? 'head'
          : tr.classList.contains('spacer') ? 'spacer'
          : tr.classList.contains('expand') ? 'expand' : 'shoe';
        hits[kind] = (hits[kind] ?? 0) + 1;
      }
      return hits;
    });
    expect(under['spacer'] ?? 0,
      `the runner is looking at ${under['spacer']} sampled points of spacer at ${y}px: `
      + JSON.stringify(under)).toBe(0);
    expect((under['shoe'] ?? 0) + (under['expand'] ?? 0),
      `the table covers almost none of the viewport at ${y}px, so a blank band would not show`)
      .toBeGreaterThan(10);
  }
});
