import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { isPathAllowed, parseRobots } from '../src/robots.js';

const liveRobots = readFileSync(new URL('./fixtures/raw/robots.txt', import.meta.url), 'utf8');

const robots = `User-agent: Googlebot\nDisallow: /private\n\nUser-agent: *\nDisallow: /search*\nDisallow: /*?*filter=*\nDisallow: /redirect/*\n`;

describe('robots', () => {
  it('collects only User-agent: * rules', () => {
    expect(parseRobots(robots)).toEqual(['/search*', '/*?*filter=*', '/redirect/*']);
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
    expect(parseRobots('User-agent: *\nDisallow: /admin # secret\n')).toEqual(['/admin']);
    expect(isPathAllowed(parseRobots('User-agent: *\nDisallow: /admin # secret\n'), '/admin/panel')).toBe(false);
  });

  it('ignores comment-only lines without ending the group', () => {
    expect(parseRobots('User-agent: *\n# a comment\nDisallow: /x\n')).toEqual(['/x']);
  });

  it('honours consecutive user-agent lines as one group', () => {
    expect(parseRobots('User-agent: *\nUser-agent: Googlebot\nDisallow: /x\n')).toEqual(['/x']);
    expect(parseRobots('User-agent: Googlebot\nUser-agent: *\nDisallow: /x\n')).toEqual(['/x']);
  });

  it('starts a new group after a rule line', () => {
    expect(parseRobots('User-agent: *\nDisallow: /x\nUser-agent: Googlebot\nDisallow: /y\n')).toEqual(['/x']);
  });

  it('ignores groups that do not include the star agent', () => {
    expect(parseRobots('User-agent: Bing\nUser-agent: Googlebot\nDisallow: /y\n')).toEqual([]);
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
