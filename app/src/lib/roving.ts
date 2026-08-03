/**
 * Arrow-key movement for a `role="radiogroup"`, applied as one action to every one of them
 * (docs/app.md §Filters). The role promises that the group is a single tab stop and that the
 * arrows move the selection; every group here made each radio its own stop and ignored the keys,
 * so the promise was a lie to anyone navigating by keyboard.
 *
 * The radios are buttons rather than native inputs — two rendered copies of a group must not join
 * one document-wide radio group by sharing a `name` — so *the browser does none of this for us*,
 * and moving focus has to activate too, which `click()` is.
 */
type Step = (from: number, count: number) => number;

/** Both axes, because not every group is a row — the generation picker is a column. */
const STEPS: Record<string, Step> = {
  ArrowRight: (i, n) => (i + 1) % n,
  ArrowDown: (i, n) => (i + 1) % n,
  ArrowLeft: (i, n) => (i + n - 1) % n,
  ArrowUp: (i, n) => (i + n - 1) % n,
  Home: () => 0,
  End: (_i, n) => n - 1,
};

export function roving(node: HTMLElement): { destroy(): void } {
  /**
   * Disabled radios are skipped rather than counted, because the role's promise has to hold even
   * when one is: a disabled control can be neither focused nor clicked, so making it the tab stop
   * takes the whole group out of the tab order and stepping onto it leaves the arrows dead. Both
   * were observed, in a grid that has since stopped using this action for an unrelated reason
   * (docs/app.md §Released after is month-granular); no group disables a radio today, so the
   * filter is inert — which is a fact about the groups that exist, not a property to rely on: the
   * first group that disables one is exactly the case this was written for.
   */
  const all = (): HTMLElement[] => [...node.querySelectorAll<HTMLElement>('[role="radio"]')];
  const radios = (): HTMLElement[] => all().filter((r) => !(r as HTMLButtonElement).disabled);
  /** Cleared across *every* radio, not just the steppable ones: a radio disabled while it held the
   *  tab stop would otherwise keep it, which is the unreachable group this guards against. */
  const mark = (active: HTMLElement | undefined): void => {
    for (const r of all()) r.tabIndex = r === active ? 0 : -1;
  };
  /** The tab stop is whatever is checked; a group with nothing checked still needs one way in. */
  const sync = (): void => {
    const list = radios();
    mark(list.find((r) => r.getAttribute('aria-checked') === 'true') ?? list[0]);
  };

  function onkeydown(e: KeyboardEvent): void {
    const step = STEPS[e.key];
    if (step === undefined) return;
    const list = radios();
    const from = list.indexOf(document.activeElement as HTMLElement);
    // A key pressed on something else inside the group — the search box in a future group, or the
    // group container itself — is not ours to answer.
    if (from === -1) return;
    e.preventDefault();
    const target = list[step(from, list.length)]!;
    mark(target);
    target.focus();
    target.click();
  }

  /**
   * Selection can also change from a mouse, or from a URL the component re-derived itself out of,
   * and the tab stop has to follow it. Watching `aria-checked` covers every one of those without
   * the component having to tell the action anything.
   */
  const watch = new MutationObserver(sync);
  // `disabled` as well as `aria-checked`: the month grid re-disables a different set of months on
  // every year step, and a tab stop left on one of them takes the whole group out of the tab order.
  watch.observe(node, { subtree: true, attributes: true, attributeFilter: ['aria-checked', 'disabled'] });
  node.addEventListener('keydown', onkeydown);
  sync();

  return {
    destroy() {
      node.removeEventListener('keydown', onkeydown);
      watch.disconnect();
    },
  };
}
