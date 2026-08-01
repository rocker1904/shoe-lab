/**
 * One home per glyph: each of these is drawn by a template that has a worded twin beside it
 * (docs/app.md §Where the utilities live), and a second copy is how one control ends up looking
 * like two. Geometry only — the `<svg>` wrapper, its size and its `aria-hidden` belong to the
 * template, because the accessible name is the button's and an icon carrying one of its own would
 * announce twice.
 */
export const ICON_PATHS = {
  copy: 'M6.6 9.4a2.9 2.9 0 004.1 0l2-2a2.9 2.9 0 00-4.1-4.1l-.8.8M9.4 6.6a2.9 2.9 0 00-4.1 0l-2 2a2.9 2.9 0 004.1 4.1l.8-.8',
  export: 'M8 2.2v7.6m0 0L5.2 7M8 9.8L10.8 7M3 13h10',
  filters: 'M2.6 3.4h10.8L9.4 8.2v4.1l-2.8 1.3V8.2z',
  columnsBox: 'M2.4 2.9h11.2v10.2H2.4z',
  columnsBars: 'M6.1 2.9v10.2M9.9 2.9v10.2',
  // Two rails and two grips: a tuner rather than a cog, because this control changes how the table
  // LOOKS and nothing else about the app (docs/app.md §Where the utilities live).
  displayRails: 'M2.5 5.5h11M2.5 10.5h11',
  displayGrips: 'M6 3.7v3.6M10.6 8.7v3.6',
} as const;
