import { describe, expect, it } from 'vitest';
import { indexTests } from './dataset';
import { orderingNote, sortPhrase } from './ordering';
import { EASY } from './score-defs';
import { TESTS, labTest } from './test-fixtures';
import { defaultColumns, defaultView, type ViewState } from './urlstate';

const idx = indexTests([...TESTS, labTest({ id: 40, slug: 'heel-tab', name: 'Heel tab', type: 'option' })]);
const view = (over: Partial<ViewState> = {}): ViewState => ({ ...defaultView(), ...over });

describe('sortPhrase', () => {
  // The words a runner reads, not the keys the URL carries: "Sorted by releasedAt, desc" is the
  // serialisation talking.
  // docs/app.md §The ordering is stated when no header can carry it
  it('names a date by its direction in time', () => {
    expect(sortPhrase({ key: 'releasedAt', dir: 'desc' }, idx)).toBe('release date, newest first');
    expect(sortPhrase({ key: 'releasedAt', dir: 'asc' }, idx)).toBe('release date, oldest first');
  });
  it('names the two identity keys alphabetically', () => {
    expect(sortPhrase({ key: 'name', dir: 'asc' }, idx)).toBe('shoe name, A to Z');
    expect(sortPhrase({ key: 'name', dir: 'desc' }, idx)).toBe('shoe name, Z to A');
    expect(sortPhrase({ key: 'brand', dir: 'asc' }, idx)).toBe('brand, A to Z');
  });
  // Plate is ordinal — none 0, plated-other 1, carbon 2 — so descending is "most plate first" like
  // every other column (docs/app.md §Two renderings, and only one of them mounted).
  it('names plate by how much plate', () => {
    expect(sortPhrase({ key: 'plate', dir: 'desc' }, idx)).toBe('plate, most plate first');
    expect(sortPhrase({ key: 'plate', dir: 'asc' }, idx)).toBe('plate, least plate first');
  });
  it('names a categorical column alphabetically, because that is how it sorts', () => {
    expect(sortPhrase({ key: 'heel-tab', dir: 'asc' }, idx)).toBe('Heel tab, A to Z');
  });
  it('names a figure by which end leads, through the one label source', () => {
    expect(sortPhrase({ key: 'weight', dir: 'asc' }, idx)).toBe('Weight, lowest first');
    expect(sortPhrase({ key: 'msrpGbp', dir: 'desc' }, idx)).toBe('price, highest first');
    expect(sortPhrase({ key: 'score', dir: 'desc' }, idx)).toBe('RunRepeat Score, highest first');
    expect(sortPhrase({ key: EASY.keys.heel, dir: 'desc' }, idx)).toBe('Easy heel score, highest first');
  });
});

/**
 * The three URL cases 0014 was filed on, plus the two that must stay silent. Derived display only:
 * nothing here reaches `ViewState`, and the line is present exactly when the sort is non-default
 * and no rendered header can carry the caret.
 */
describe('orderingNote', () => {
  const sorted = (key: string, dir: 'asc' | 'desc' = 'desc') => view({ sort: { key, dir } });

  it('states the order on a phone for every sort key that is not a figure column', () => {
    expect(orderingNote(sorted('releasedAt'), true, idx)).toBe('release date, newest first');
    expect(orderingNote(sorted('name', 'asc'), true, idx)).toBe('shoe name, A to Z');
    expect(orderingNote(sorted('plate'), true, idx)).toBe('plate, most plate first');
  });
  // The desktop renders `releasedAt` and `plate` as real columns with their own headers, so those
  // two carry the caret there and the line would be saying it twice.
  it('leaves the desktop silent where a header already carries the key', () => {
    expect(orderingNote(sorted('releasedAt'), false, idx)).toBeNull();
    expect(orderingNote(sorted('plate'), false, idx)).toBeNull();
    expect(orderingNote(sorted('name', 'asc'), false, idx)).toBeNull();
  });
  // `brand` has a header on neither rendering, which is why it is the desktop's remaining case.
  it('states a brand sort on both renderings', () => {
    expect(orderingNote(sorted('brand'), false, idx)).toBe('brand, Z to A');
    expect(orderingNote(sorted('brand'), true, idx)).toBe('brand, Z to A');
  });
  it('says nothing on the default sort, on either rendering', () => {
    expect(orderingNote(view(), false, idx)).toBeNull();
    expect(orderingNote(view(), true, idx)).toBeNull();
  });
  it('says nothing when a visible figure column carries the sort', () => {
    expect(orderingNote(sorted('weight'), false, idx)).toBeNull();
    expect(orderingNote(sorted('weight'), true, idx)).toBeNull();
  });
  // A sort key can be dropped from the column set by hand, and then nothing on either rendering
  // marks it — the caret lives on headers, and there is no header left.
  it('states a figure sort whose column has been unticked', () => {
    const v = view({ sort: { key: 'weight', dir: 'asc' }, columns: defaultColumns('heel').filter((c) => c !== 'weight') });
    expect(orderingNote(v, false, idx)).toBe('Weight, lowest first');
    expect(orderingNote(v, true, idx)).toBe('Weight, lowest first');
  });
});
