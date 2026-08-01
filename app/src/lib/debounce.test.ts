import { afterEach, describe, expect, it, vi } from 'vitest';
import { debounce } from './debounce';

afterEach(() => {
  vi.useRealTimers();
});

describe('debounce', () => {
  it('writes once for a burst of changes', () => {
    vi.useFakeTimers();
    const spy = vi.fn();
    const write = debounce(spy, 200);
    for (let i = 0; i < 60; i++) write(i);
    expect(spy).not.toHaveBeenCalled();
    vi.advanceTimersByTime(200);
    expect(spy).toHaveBeenCalledTimes(1);
  });

  it('writes the last call of the burst, not the first', () => {
    vi.useFakeTimers();
    const spy = vi.fn();
    const write = debounce(spy, 200);
    write('a');
    write('b');
    vi.advanceTimersByTime(200);
    expect(spy).toHaveBeenCalledExactlyOnceWith('b');
  });

  it('starts a fresh window once the pending call has landed', () => {
    vi.useFakeTimers();
    const spy = vi.fn();
    const write = debounce(spy, 200);
    write('a');
    vi.advanceTimersByTime(200);
    write('b');
    vi.advanceTimersByTime(200);
    expect(spy).toHaveBeenCalledTimes(2);
  });

  it('flushes on demand, for pagehide', () => {
    vi.useFakeTimers();
    const spy = vi.fn();
    const write = debounce(spy, 200);
    write('a');
    write.flush();
    expect(spy).toHaveBeenCalledExactlyOnceWith('a');
    // The flushed call is spent: the timer it cancelled must not fire it a second time.
    vi.advanceTimersByTime(200);
    expect(spy).toHaveBeenCalledTimes(1);
  });

  it('does nothing when flushed with nothing pending', () => {
    vi.useFakeTimers();
    const spy = vi.fn();
    const write = debounce(spy, 200);
    write.flush();
    expect(spy).not.toHaveBeenCalled();
  });

  it('cancels the pending call, for popstate', () => {
    vi.useFakeTimers();
    const spy = vi.fn();
    const write = debounce(spy, 200);
    write('a');
    write.cancel();
    vi.advanceTimersByTime(200);
    expect(spy).not.toHaveBeenCalled();
  });

  it('does not resurface a cancelled call on the next flush', () => {
    vi.useFakeTimers();
    const spy = vi.fn();
    const write = debounce(spy, 200);
    write('a');
    write.cancel();
    write.flush();
    expect(spy).not.toHaveBeenCalled();
  });

  it('takes a fresh call after a cancel', () => {
    vi.useFakeTimers();
    const spy = vi.fn();
    const write = debounce(spy, 200);
    write('a');
    write.cancel();
    write('b');
    vi.advanceTimersByTime(200);
    expect(spy).toHaveBeenCalledExactlyOnceWith('b');
  });
});
