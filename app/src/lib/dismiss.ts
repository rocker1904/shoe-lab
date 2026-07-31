/**
 * Outside-press dismissal for a floating panel, shared by all four of them — the column picker,
 * the help popover, the month picker and the add-filter dialog's scrim stands in for it
 * (docs/app.md §Filters). Three choices here are not obvious, and each was got wrong first:
 *
 * **`pointerdown`, not `click`.** It fires before focus moves, so a press on the panel's own
 * trigger is still recognised as inside and is left to the trigger's toggle. On `click` the order
 * is focusout → close → click → reopen, and a trigger stops being able to shut the panel it
 * opened. It is also what makes a drag that starts inside and ends outside — selecting the text of
 * a help popover, say — leave the panel alone.
 *
 * **Capture phase.** The listener has to see the press whether or not something between the target
 * and `document` stops it bubbling; the month picker's grid and the drawer both handle pointer
 * events of their own.
 *
 * **`within` is a getter, not a node.** The panel's root is a `bind:this` that is null on the tick
 * the effect first runs and can be replaced when the panel re-renders, so reading it per event is
 * what keeps the check pointed at the node that is actually on screen.
 *
 * The caller owns *when* — `$effect(() => { if (!open) return; return dismissOnOutsidePress(…) })`
 * adds the listener only while the panel is open and removes it on close and on destroy, which is
 * the whole leak story.
 */
export function dismissOnOutsidePress(
  within: () => Node | null | undefined,
  dismiss: () => void,
): () => void {
  // `contains(null)` is false, so a press with no target counts as outside without a branch of its
  // own — which is right: nothing identifiable was pressed inside the panel.
  const onpress = (e: Event) => {
    if (!within()?.contains(e.target as Node | null)) dismiss();
  };
  document.addEventListener('pointerdown', onpress, true);
  return () => document.removeEventListener('pointerdown', onpress, true);
}
