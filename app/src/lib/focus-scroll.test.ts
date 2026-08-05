import { describe, expect, it } from 'vitest';
import { scrollDelta } from './focus-scroll';

/**
 * The arithmetic only, because jsdom has no layout: the DOM half is measured in three real engines
 * by `cross-browser.spec.ts` and by the `hunt/` rig, which is where the engine differences this
 * exists for are visible at all (docs/app.md §Theming).
 */
describe('scrollDelta', () => {
  const port = { top: 100, height: 200 };   // 100..300

  it('leaves a control that already clears the room alone', () => {
    expect(scrollDelta(port, { top: 150, bottom: 180 }, 4)).toBe(0);
  });

  it('scrolls up for a control above the port', () => {
    expect(scrollDelta(port, { top: 60, bottom: 90 }, 4)).toBe(-44);
  });

  it('scrolls down for a control below the port', () => {
    expect(scrollDelta(port, { top: 280, bottom: 310 }, 4)).toBe(14);
  });

  /** The whole reason the port reserves room: flush is not far enough, the ring is drawn outside. */
  it('counts a control flush against an edge as needing the room', () => {
    expect(scrollDelta(port, { top: 100, bottom: 130 }, 4)).toBe(-4);
    expect(scrollDelta(port, { top: 270, bottom: 300 }, 4)).toBe(4);
  });

  it('rounds a subpixel correction away from the clipped edge', () => {
    expect(scrollDelta({ top: 100.25, height: 199.5 }, { top: 104, bottom: 200 }, 4)).toBe(-1);
    expect(scrollDelta({ top: 100.25, height: 199.5 }, { top: 200, bottom: 296 }, 4)).toBe(1);
  });

  it('asks for nothing when the port reserves no room and the control fits', () => {
    expect(scrollDelta(port, { top: 100, bottom: 300 }, 0)).toBe(0);
  });

  /** Taller than the port: chasing its bottom would push its top and its label out of sight. */
  it('aligns a control taller than the port to the top', () => {
    expect(scrollDelta(port, { top: 200, bottom: 600 }, 4)).toBe(96);
  });
});
