export interface Debounced<A extends unknown[]> {
  (...args: A): void;
  /** Land the pending call now. `pagehide` is the caller that needs it: a page being torn down
   *  cannot wait out a timer (docs/app.md §View and URL ownership). */
  flush(): void;
  /** Drop the pending call unwritten. `popstate` is the caller: the pending write belongs to the
   *  entry just left, which can no longer be reached, so landing it would put one view's address on
   *  another entry (docs/app.md §View and URL ownership). */
  cancel(): void;
}

/**
 * Trailing only, and deliberately so: a drag fires about sixty view updates a second, and the
 * first of them is not the one worth writing — the last is. Leading-edge would put the write back
 * on the frame path it exists to leave (docs/app.md §View and URL ownership).
 */
export function debounce<A extends unknown[]>(fn: (...args: A) => void, ms: number): Debounced<A> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  let pending: A | undefined;

  const fire = (): void => {
    if (timer !== undefined) clearTimeout(timer);
    timer = undefined;
    const args = pending;
    pending = undefined;
    if (args !== undefined) fn(...args);
  };

  const out = (...args: A): void => {
    pending = args;
    if (timer !== undefined) clearTimeout(timer);
    timer = setTimeout(fire, ms);
  };
  out.flush = fire;
  out.cancel = (): void => {
    if (timer !== undefined) clearTimeout(timer);
    timer = undefined;
    pending = undefined;
  };
  return out;
}
