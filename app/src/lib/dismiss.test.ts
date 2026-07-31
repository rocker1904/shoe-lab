import { afterEach, describe, expect, it, vi } from 'vitest';
import { dismissOnOutsidePress } from './dismiss';

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
