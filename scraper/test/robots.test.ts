import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { isPathAllowed, parseRobots } from '../src/robots.js';

const liveRobots = readFileSync(new URL('./fixtures/raw/robots.txt', import.meta.url), 'utf8');

const robots = `User-agent: Googlebot\nDisallow: /private\n\nUser-agent: *\nDisallow: /search*\nDisallow: /*?*filter=*\nDisallow: /redirect/*\n`;

const patterns = (txt: string): string[] => parseRobots(txt).map((r) => r.pattern);

describe('robots', () => {
  it('collects only User-agent: * rules', () => {
    expect(patterns(robots)).toEqual(['/search*', '/*?*filter=*', '/redirect/*']);
    expect(parseRobots(robots).every((r) => !r.allow)).toBe(true);
  });
  it('matches wildcard rules', () => {
    const rules = parseRobots(robots);
    expect(isPathAllowed(rules, '/uk/saucony-endorphin-azura')).toBe(true);
    expect(isPathAllowed(rules, '/api/product/lab-test-list/5')).toBe(true);
    expect(isPathAllowed(rules, '/search-stuff')).toBe(false);
    expect(isPathAllowed(rules, '/catalog?a=1&filter=x')).toBe(false);
    expect(isPathAllowed(rules, '/redirect/out')).toBe(false);
  });
  it('empty rules allow everything', () => {
    expect(isPathAllowed([], '/anything')).toBe(true);
  });

  it('strips inline comments from rules', () => {
    expect(patterns('User-agent: *\nDisallow: /admin # secret\n')).toEqual(['/admin']);
    expect(isPathAllowed(parseRobots('User-agent: *\nDisallow: /admin # secret\n'), '/admin/panel')).toBe(false);
  });

  it('ignores comment-only lines without ending the group', () => {
    expect(patterns('User-agent: *\n# a comment\nDisallow: /x\n')).toEqual(['/x']);
  });

  it('honours consecutive user-agent lines as one group', () => {
    expect(patterns('User-agent: *\nUser-agent: Googlebot\nDisallow: /x\n')).toEqual(['/x']);
    expect(patterns('User-agent: Googlebot\nUser-agent: *\nDisallow: /x\n')).toEqual(['/x']);
  });

  it('starts a new group after a rule line', () => {
    expect(patterns('User-agent: *\nDisallow: /x\nUser-agent: Googlebot\nDisallow: /y\n')).toEqual(['/x']);
  });

  it('ignores groups that do not include the star agent', () => {
    expect(patterns('User-agent: Bing\nUser-agent: Googlebot\nDisallow: /y\n')).toEqual([]);
  });
});

// RFC 9309 §2.2.2 defines exactly two special characters in a path pattern, and the anchor is the
// one that fails open when it is missed: an unimplemented `$` turns every anchored rule into a
// rule nothing can match.
describe('robots $ end-of-match anchor', () => {
  it('refuses a path an anchored rule names', () => {
    const rules = parseRobots('User-agent: *\nDisallow: /uk/*/print$');
    expect(isPathAllowed(rules, '/uk/nike-vaporfly-4/print')).toBe(false);
    expect(isPathAllowed(rules, '/uk/nike-vaporfly-4/printer')).toBe(true);
  });

  it('anchors the extension form', () => {
    const rules = parseRobots('User-agent: *\nDisallow: /*.json$');
    expect(isPathAllowed(rules, '/uk/x.json')).toBe(false);
    expect(isPathAllowed(rules, '/uk/x.json.gz')).toBe(true);
  });

  it('reads a lone $ as the empty pattern, which no real path matches', () => {
    const rules = parseRobots('User-agent: *\nDisallow: $');
    expect(isPathAllowed(rules, '/uk/shoe')).toBe(true);
    expect(isPathAllowed(rules, '')).toBe(false);
  });

  it('treats a $ that is not the last character as a literal dollar', () => {
    const rules = parseRobots('User-agent: *\nDisallow: /a$b');
    expect(isPathAllowed(rules, '/a$b/c')).toBe(false);
    expect(isPathAllowed(rules, '/ab')).toBe(true);
  });

  it('anchors only the final $ of a doubled one', () => {
    const rules = parseRobots('User-agent: *\nDisallow: /a$$');
    expect(isPathAllowed(rules, '/a$')).toBe(false);
    expect(isPathAllowed(rules, '/a$b')).toBe(true);
  });

  it('anchors a rule that is only a wildcard and an anchor', () => {
    const rules = parseRobots('User-agent: *\nDisallow: /*$');
    expect(isPathAllowed(rules, '/anything')).toBe(false);
  });
});

// Without Allow the parser aborts crawls robots.txt permits — fails closed, but closed on our own
// foot rather than on RunRepeat's.
describe('robots Allow rules', () => {
  it('carves an exception out of a broader Disallow', () => {
    const rules = parseRobots('User-agent: *\nDisallow: /uk/\nAllow: /uk/public');
    expect(isPathAllowed(rules, '/uk/public')).toBe(true);
    expect(isPathAllowed(rules, '/uk/other')).toBe(false);
  });

  it('lets the most specific match win regardless of line order', () => {
    const rules = parseRobots('User-agent: *\nAllow: /a\nDisallow: /a/b');
    expect(isPathAllowed(rules, '/a/b/c')).toBe(false);
    expect(isPathAllowed(rules, '/a/c')).toBe(true);
  });

  it('resolves an equally specific pair in favour of the allow', () => {
    expect(isPathAllowed(parseRobots('User-agent: *\nDisallow: /x\nAllow: /x'), '/x')).toBe(true);
    expect(isPathAllowed(parseRobots('User-agent: *\nAllow: /x\nDisallow: /x'), '/x')).toBe(true);
  });

  it('honours $ on an Allow rule too', () => {
    const rules = parseRobots('User-agent: *\nDisallow: /uk/\nAllow: /uk/*/print$');
    expect(isPathAllowed(rules, '/uk/shoe/print')).toBe(true);
    expect(isPathAllowed(rules, '/uk/shoe/printer')).toBe(false);
  });

  it('ignores Allow lines outside the star group', () => {
    const rules = parseRobots('User-agent: *\nDisallow: /uk/\n\nUser-agent: Googlebot\nAllow: /uk/public');
    expect(isPathAllowed(rules, '/uk/public')).toBe(false);
  });

  it('ignores an empty Allow line', () => {
    expect(patterns('User-agent: *\nAllow:\nDisallow: /x')).toEqual(['/x']);
  });
});

describe('robots against the live runrepeat.com fixture', () => {
  const rules = parseRobots(liveRobots);

  it('parses every disallow rule', () => {
    expect(rules.length).toBe(96);
  });

  it('allows the paths the scraper needs', () => {
    expect(isPathAllowed(rules, '/uk/saucony-endorphin-azura')).toBe(true);
    expect(isPathAllowed(rules, '/api/product/lab-test-list/1')).toBe(true);
  });

  it('denies the paths the site disallows', () => {
    expect(isPathAllowed(rules, '/search-stuff')).toBe(false);
    expect(isPathAllowed(rules, '/catalog?a=1&filter=x')).toBe(false);
  });
});
