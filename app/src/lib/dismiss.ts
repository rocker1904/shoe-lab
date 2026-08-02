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
 * **A press deafens it for the length of that press.** A focus move a pointer caused is never the
 * keyboard exit this listener exists for, and the press listener above has already answered it:
 * outside dismisses, inside belongs to the trigger. Reading `relatedTarget` instead handed that
 * answer to the ENGINE — macOS does not focus a button that is pressed, so WebKit named a node
 * outside the anchor, the month picker's own trigger closed the panel on `focusout`, and its
 * `click` reopened it. That is the exact failure `pointerdown` was chosen to avoid, arriving by
 * another door, and green in all three engines on Linux, where a pressed button takes focus.
 *
 * **A null `relatedTarget` is answered by where focus SETTLES, one task later.** Focus going
 * nowhere identifiable is what a stepper that disables itself produces — the month picker steps its
 * year that way and catches the runner back into the grid, which is the case
 * docs/app.md §Released after is month-granular sets out — and it is equally what an engine
 * declining to name a genuine exit produces.
 * The two are indistinguishable at the event and plain a task afterwards: the stepper's recovery
 * runs on the microtask its own `await tick()` resolves on, so the check finds focus back inside
 * and closes nothing, where a real exit has left `document.activeElement` outside.
 */
export function dismissOnFocusLeave(
  within: () => Node | null | undefined,
  dismiss: () => void,
): () => void {
  let pressing = false;
  let settling: ReturnType<typeof setTimeout> | undefined;
  const down = () => { pressing = true; };
  const up = () => { pressing = false; };
  const onleave = (e: FocusEvent) => {
    const box = within();
    if (!box?.contains(e.target as Node | null)) return;
    if (pressing) return;
    const to = e.relatedTarget as Node | null;
    if (to !== null) {
      if (!box.contains(to)) dismiss();
      return;
    }
    clearTimeout(settling);
    settling = setTimeout(() => {
      const now = within();
      if (now && !now.contains(document.activeElement)) dismiss();
    });
  };
  document.addEventListener('pointerdown', down, true);
  document.addEventListener('pointerup', up, true);
  document.addEventListener('pointercancel', up, true);
  document.addEventListener('focusout', onleave, true);
  return () => {
    clearTimeout(settling);
    document.removeEventListener('pointerdown', down, true);
    document.removeEventListener('pointerup', up, true);
    document.removeEventListener('pointercancel', up, true);
    document.removeEventListener('focusout', onleave, true);
  };
}
