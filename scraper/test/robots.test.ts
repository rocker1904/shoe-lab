import { describe, expect, it } from 'vitest';
import { isPathAllowed, parseRobots } from '../src/robots.js';

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
});
