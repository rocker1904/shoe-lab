import { afterEach, describe, expect, it, vi } from 'vitest';
import { dismissOnFocusLeave, dismissOnOutsidePress } from './dismiss';

/** jsdom implements no `PointerEvent`, and this listener reads nothing but `target`. */
const press = (target: EventTarget) =>
  target.dispatchEvent(new Event('pointerdown', { bubbles: true }));

let stop: (() => void) | undefined;
afterEach(() => {
  stop?.();
  stop = undefined;
  document.body.innerHTML = '';
});

describe('dismissOnOutsidePress', () => {
  const setup = () => {
    const panel = document.createElement('div');
    const inside = document.createElement('button');
    const outside = document.createElement('button');
    panel.append(inside);
    document.body.append(panel, outside);
    const dismiss = vi.fn();
    stop = dismissOnOutsidePress(() => panel, dismiss);
    return { panel, inside, outside, dismiss };
  };

  it('dismisses on a press outside the panel', () => {
    const { outside, dismiss } = setup();
    press(outside);
    expect(dismiss).toHaveBeenCalledOnce();
  });

  it('leaves a press inside alone, at any depth', () => {
    const { panel, inside, dismiss } = setup();
    press(panel);
    press(inside);
    expect(dismiss).not.toHaveBeenCalled();
  });

  it('counts a press as outside while the panel is not on screen yet', () => {
    const dismiss = vi.fn();
    stop = dismissOnOutsidePress(() => null, dismiss);
    press(document.body);
    expect(dismiss).toHaveBeenCalledOnce();
  });

  // The leak this exists to prevent: the listener belongs to the open panel, not to the document.
  it('removes its listener when the returned function runs', () => {
    const { outside, dismiss } = setup();
    stop!();
    stop = undefined;
    press(outside);
    expect(dismiss).not.toHaveBeenCalled();
  });

  it('sees a press that something between the target and the document stops bubbling', () => {
    const { panel, outside, dismiss } = setup();
    panel.parentElement!.addEventListener('pointerdown', (e) => e.stopPropagation());
    press(outside);
    expect(dismiss).toHaveBeenCalledOnce();
  });
});

/** The move is dispatched the way the browser sends it — from the element focus is leaving, naming
 *  where it went — rather than driven through `.focus()`, which in jsdom fires nothing for a node
 *  that is not focusable. `relatedTarget` is constructor-only: it has no setter. */
const leave = (from: EventTarget, to: EventTarget | null) =>
  from.dispatchEvent(new FocusEvent('focusout', { bubbles: true, relatedTarget: to }));

describe('dismissOnFocusLeave', () => {
  const setup = () => {
    const panel = document.createElement('div');
    const inside = document.createElement('button');
    const deeper = document.createElement('input');
    const outside = document.createElement('button');
    inside.append(deeper);
    panel.append(inside);
    document.body.append(panel, outside);
    const dismiss = vi.fn();
    stop = dismissOnFocusLeave(() => panel, dismiss);
    return { panel, inside, deeper, outside, dismiss };
  };

  it('dismisses when focus leaves the panel forwards', () => {
    const { inside, outside, dismiss } = setup();
    leave(inside, outside);
    expect(dismiss).toHaveBeenCalledOnce();
  });

  // The half that was missing: the month picker's trigger was a landing pad outside its own panel,
  // so the next Shift+Tab left from a node the panel's own handler never saw.
  it('dismisses when focus leaves it backwards, from any depth', () => {
    const { deeper, outside, dismiss } = setup();
    leave(deeper, outside);
    expect(dismiss).toHaveBeenCalledOnce();
  });

  it('leaves a move within the panel alone', () => {
    const { inside, deeper, dismiss } = setup();
    leave(inside, deeper);
    leave(deeper, inside);
    expect(dismiss).not.toHaveBeenCalled();
  });

  /** The documented subtlety: a stepper that disables itself under the pointer drops focus to
   *  nothing, and that is indistinguishable from a click on unfocusable chrome
   *  (docs/app.md §Released after is month-granular). Neither may close the panel. */
  it('leaves a move to nothing alone', () => {
    const { deeper, dismiss } = setup();
    leave(deeper, null);
    expect(dismiss).not.toHaveBeenCalled();
  });

  // Focus moving between two things outside is not this panel's business at all.
  it('ignores a move that never started inside', () => {
    const { outside, dismiss } = setup();
    leave(outside, document.body);
    expect(dismiss).not.toHaveBeenCalled();
  });

  it('counts nothing as inside while the panel is not on screen yet', () => {
    const dismiss = vi.fn();
    const from = document.createElement('button');
    document.body.append(from);
    stop = dismissOnFocusLeave(() => null, dismiss);
    leave(from, document.body);
    expect(dismiss).not.toHaveBeenCalled();
  });

  it('removes its listener when the returned function runs', () => {
    const { inside, outside, dismiss } = setup();
    stop!();
    stop = undefined;
    leave(inside, outside);
    expect(dismiss).not.toHaveBeenCalled();
  });
});
