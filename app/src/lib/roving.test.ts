import { afterEach, describe, expect, it, vi } from 'vitest';
import { roving } from './roving';

/** Shaped like the four real groups: buttons carrying `aria-checked`, never native radio inputs. */
function group(checked: number | null = 1, n = 3) {
  const el = document.createElement('div');
  el.setAttribute('role', 'radiogroup');
  for (let i = 0; i < n; i++) {
    const b = document.createElement('button');
    b.setAttribute('role', 'radio');
    b.setAttribute('aria-checked', String(i === checked));
    b.textContent = `r${i}`;
    el.append(b);
  }
  document.body.append(el);
  const radios = [...el.querySelectorAll<HTMLElement>('[role="radio"]')];
  return { el, radios, action: roving(el) };
}

const tabs = (radios: HTMLElement[]) => radios.map((r) => r.tabIndex);
const press = (from: HTMLElement, key: string) =>
  from.dispatchEvent(new KeyboardEvent('keydown', { key, bubbles: true, cancelable: true }));

afterEach(() => {
  document.body.replaceChildren();
});

describe('roving', () => {
  it("makes the checked radio the group's only tab stop", () => {
    const { radios } = group(1);
    expect(tabs(radios)).toEqual([-1, 0, -1]);
  });

  it('falls back to the first radio when nothing is checked', () => {
    const { radios } = group(null);
    expect(tabs(radios)).toEqual([0, -1, -1]);
  });

  it('moves to the next radio on ArrowRight and activates it', () => {
    const { radios } = group(1);
    const clicked = vi.fn();
    radios[2]!.addEventListener('click', clicked);
    radios[1]!.focus();
    press(radios[1]!, 'ArrowRight');
    expect(document.activeElement).toBe(radios[2]);
    expect(clicked).toHaveBeenCalled();
    expect(tabs(radios)).toEqual([-1, -1, 0]);
  });

  it('moves to the previous radio on ArrowLeft', () => {
    const { radios } = group(1);
    radios[1]!.focus();
    press(radios[1]!, 'ArrowLeft');
    expect(document.activeElement).toBe(radios[0]);
  });

  it('wraps past the last radio and before the first', () => {
    const { radios } = group(1);
    radios[2]!.focus();
    press(radios[2]!, 'ArrowRight');
    expect(document.activeElement).toBe(radios[0]);
    press(radios[0]!, 'ArrowLeft');
    expect(document.activeElement).toBe(radios[2]);
  });

  it('treats Down and Up as Right and Left, because one group is a column', () => {
    const { radios } = group(1);
    radios[1]!.focus();
    press(radios[1]!, 'ArrowDown');
    expect(document.activeElement).toBe(radios[2]);
    press(radios[2]!, 'ArrowUp');
    expect(document.activeElement).toBe(radios[1]);
  });

  it('jumps to either end on Home and End', () => {
    const { radios } = group(1);
    radios[1]!.focus();
    press(radios[1]!, 'End');
    expect(document.activeElement).toBe(radios[2]);
    press(radios[2]!, 'Home');
    expect(document.activeElement).toBe(radios[0]);
  });

  it('leaves keys it does not own to the page', () => {
    const { radios } = group(1);
    radios[1]!.focus();
    const handled = press(radios[1]!, 'a');
    expect(handled).toBe(true); // not prevented: typing still belongs to whatever is listening
    expect(document.activeElement).toBe(radios[1]);
  });

  it('does nothing when the key came from outside the radios', () => {
    const { el, radios } = group(1);
    press(el, 'ArrowRight');
    expect(document.activeElement).not.toBe(radios[2]);
  });

  it('follows a selection made with the mouse, so the tab stop stays on what is chosen', async () => {
    const { radios } = group(1);
    radios[1]!.setAttribute('aria-checked', 'false');
    radios[0]!.setAttribute('aria-checked', 'true');
    await new Promise((r) => setTimeout(r, 0));
    expect(tabs(radios)).toEqual([0, -1, -1]);
  });

  /**
   * The month picker is the first group to disable some of its radios, and a disabled control can
   * neither be focused nor clicked — so making one the tab stop leaves the group unreachable, and
   * stepping onto one leaves the arrows dead. Both were reproduced in a browser before this.
   */
  describe('disabled radios', () => {
    const disable = (radios: HTMLElement[], ...i: number[]) => {
      for (const n of i) (radios[n] as HTMLButtonElement).disabled = true;
      return radios;
    };

    it('never makes a disabled radio the tab stop, even when it is the only checked one', () => {
      const el = document.createElement('div');
      el.setAttribute('role', 'radiogroup');
      for (let i = 0; i < 3; i++) {
        const b = document.createElement('button');
        b.setAttribute('role', 'radio');
        b.setAttribute('aria-checked', 'false');
        if (i === 0) b.disabled = true;
        el.append(b);
      }
      document.body.append(el);
      roving(el);
      const radios = [...el.querySelectorAll<HTMLElement>('[role="radio"]')];
      expect(tabs(radios)).toEqual([-1, 0, -1]);
    });

    it('steps over a disabled radio rather than stalling on it', () => {
      const { radios } = group(0, 4);
      disable(radios, 1);
      radios[0]!.focus();
      press(radios[0]!, 'ArrowRight');
      expect(document.activeElement).toBe(radios[2]);
    });

    it('wraps past a disabled radio at the end of the group', () => {
      const { radios } = group(0, 3);
      disable(radios, 2);
      radios[0]!.focus();
      press(radios[0]!, 'ArrowLeft');
      expect(document.activeElement).toBe(radios[1]);
    });

    /** Awaited because the tab stop is resynced by a MutationObserver, which fires on a microtask —
     *  the same reason the mouse-selection test above awaits. */
    it('gives up the tab stop when every radio becomes disabled', async () => {
      const { radios } = group(null, 3);
      disable(radios, 0, 1, 2);
      await new Promise((r) => setTimeout(r, 0));
      expect(tabs(radios)).toEqual([-1, -1, -1]);
      expect(() => press(radios[0]!, 'ArrowRight')).not.toThrow();
    });
  });

  it('stops listening once destroyed', () => {
    const { radios, action } = group(1);
    action.destroy();
    radios[1]!.focus();
    press(radios[1]!, 'ArrowRight');
    expect(document.activeElement).toBe(radios[1]);
  });
});
