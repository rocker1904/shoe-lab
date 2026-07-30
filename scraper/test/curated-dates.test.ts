import { describe, expect, it } from 'vitest';
import { parseCuratedDates, validateCuratedDates } from '../src/curated-dates.js';
import { ValidationError } from '../src/validate.js';

const cited = '"sources":[{"url":"https://weartesters.com/x","quote":"Release Date: March 2024"}]';
const row = (over: string) => `{"slug":"a","month":"2024-03","reliability":"ok",${cited}${over}}`;

describe('parseCuratedDates', () => {
  it('keeps a cited, usable month', () => {
    expect(parseCuratedDates(row('')).get('a')).toBe('2024-03');
  });

  it('keeps a suspect month, because a month that may be off by one still beats 1 January', () => {
    const line = `{"slug":"a","month":"2024-03","reliability":"suspect",${cited}}`;
    expect(parseCuratedDates(line).get('a')).toBe('2024-03');
  });

  it('records an unresolved row as seen-but-undated rather than dropping the slug', () => {
    // The slug must stay known, or the stale gate would flag a row that is doing its job.
    const line = '{"slug":"a","month":null,"reliability":"unresolved","sources":[]}';
    expect(parseCuratedDates(line).get('a')).toBe('');
  });

  it('ignores blank lines and trailing newline', () => {
    expect(parseCuratedDates(`\n${row('')}\n\n`).size).toBe(1);
  });

  it('rejects a month that is not YYYY-MM', () => {
    for (const m of ['2024-3', '2024-13', '2024-00', '2024-03-01', 'March 2024']) {
      const line = `{"slug":"a","month":"${m}","reliability":"ok",${cited}}`;
      expect(() => parseCuratedDates(line)).toThrow(ValidationError);
    }
  });

  it('rejects a month carried on an unresolved row', () => {
    const line = `{"slug":"a","month":"2024-03","reliability":"unresolved",${cited}}`;
    expect(() => parseCuratedDates(line)).toThrow(/reliability is unresolved/);
  });

  it('rejects a month with no cited https source, since it outranks the scraped data', () => {
    expect(() => parseCuratedDates('{"slug":"a","month":"2024-03","reliability":"ok","sources":[]}'))
      .toThrow(/no cited https source/);
    const noQuote = '{"slug":"a","month":"2024-03","reliability":"ok","sources":[{"url":"https://x/y","quote":"  "}]}';
    expect(() => parseCuratedDates(noQuote)).toThrow(/no cited https source/);
    const httpOnly = '{"slug":"a","month":"2024-03","reliability":"ok","sources":[{"url":"http://x/y","quote":"q"}]}';
    expect(() => parseCuratedDates(httpOnly)).toThrow(/no cited https source/);
  });

  it('rejects malformed JSON, a missing slug and a duplicate slug', () => {
    expect(() => parseCuratedDates('{not json')).toThrow(/line 1: not valid JSON/);
    expect(() => parseCuratedDates('{"month":null,"reliability":"unresolved"}')).toThrow(/missing slug/);
    expect(() => parseCuratedDates(`${row('')}\n${row('')}`)).toThrow(/duplicate slug a/);
  });
});

describe('validateCuratedDates', () => {
  it('passes when every entry names a shoe with no precise page date', () => {
    expect(() => validateCuratedDates(new Map([['a', '2024-03'], ['b', '']]),
      new Map([['a', false], ['b', false]]))).not.toThrow();
  });

  it('fails on a stale entry rather than letting the file rot silently', () => {
    expect(() => validateCuratedDates(new Map([['gone', '2024-03']]), new Map([['a', false]])))
      .toThrow(/gone is stale/);
  });

  it('fails on an entry that a precise page date already outranks', () => {
    expect(() => validateCuratedDates(new Map([['a', '2024-03']]), new Map([['a', true]])))
      .toThrow(/a is unusable/);
  });

  it('allows an undated entry on a precisely-dated shoe, which takes no effect either way', () => {
    expect(() => validateCuratedDates(new Map([['a', '']]), new Map([['a', true]]))).not.toThrow();
  });
});
