/**
 * Outside-press dismissal for a floating panel, shared by the two anchored to a trigger of their
 * own — the column picker and the month picker. Each dialog's scrim is the same affordance drawn
 * rather than a second mechanism (docs/app.md §Every floating panel dismisses the same way). Three choices here are not obvious, and each was got wrong first:
 *
 * **`pointerdown`, not `click`.** It fires before focus moves, so a press on the panel's own
 * trigger is still recognised as inside and is left to the trigger's toggle. On `click` the order
 * is focusout → close → click → reopen, and a trigger stops being able to shut the panel it
 * opened. It is also what makes a drag that starts inside and ends outside — selecting the text of
 * a dialog's prose, say — leave the panel alone.
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

/**
 * The keyboard's half of the same policy: a panel whose focus leaves it, in **either** direction,
 * is dismissed — the keyboard equivalent of the outside press above
 * (docs/app.md §Every floating panel dismisses the same way).
 *
 * Without it a runner Tabbing out left the panel hanging over the controls they tabbed to next, and
 * **Escape was inert from that point on**, because the key event is delivered to whatever now holds
 * focus and each panel's Escape handler is bound to the panel. The month picker survived a
 * backwards exit and the column picker survived one in either direction.
 *
 * Three choices, and the last one is the subtle one:
 *
 * **On `document`, in capture, like the press listener.** The panel's root is a `bind:this` that
 * can be replaced when the panel re-renders, and a listener bound to the node would go with it.
 *
 * **Both ends are checked.** The move has to *start* inside — focus travelling between two things
 * outside is not this panel's business — and it has to *end* outside. `within` is the whole anchor
 * rather than the panel, so Tabbing back to the trigger is not leaving: it is how the runner shuts
 * the panel they just opened.
 *
 * **A null `relatedTarget` does NOT close.** Focus going nowhere identifiable is what a click on
 * unfocusable chrome produces, and also what a stepper that disables itself under the pointer
 * produces (docs/app.md §Released after is month-granular) — the month picker steps its year that
 * way and would shut itself at the ends of the fleet. The pointer case is already answered by the
 * press listener, so treating null as "not a departure" costs nothing and saves that.
 */
export function dismissOnFocusLeave(
  within: () => Node | null | undefined,
  dismiss: () => void,
): () => void {
  const onleave = (e: FocusEvent) => {
    const box = within();
    if (!box?.contains(e.target as Node | null)) return;
    const to = e.relatedTarget as Node | null;
    if (to === null || box.contains(to)) return;
    dismiss();
  };
  document.addEventListener('focusout', onleave, true);
  return () => document.removeEventListener('focusout', onleave, true);
}
