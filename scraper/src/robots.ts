/** One rule of the `*` group. RFC 9309 §2.2.2 gives allow and disallow the same matching rules. */
export interface RobotsRule { allow: boolean; pattern: string }

export function parseRobots(txt: string): RobotsRule[] {
  const rules: RobotsRule[] = [];
  let inStar = false;
  let afterRule = true; // the next user-agent line opens a fresh group
  for (const raw of txt.split(/\r?\n/)) {
    const line = raw.replace(/#.*$/, '').trim();
    if (line === '') continue;
    const ua = /^user-agent:\s*(.+)$/i.exec(line);
    if (ua) {
      // Consecutive user-agent lines share one rule group (RFC 9309), so only a
      // user-agent line that follows a rule starts a new group.
      if (afterRule) { inStar = false; afterRule = false; }
      if (ua[1]!.trim() === '*') inStar = true;
      continue;
    }
    afterRule = true;
    const rule = /^(dis)?allow:\s*(.*)$/i.exec(line);
    // An empty pattern states no rule at all, whichever verb carries it.
    if (rule && inStar && rule[2]) rules.push({ allow: rule[1] === undefined, pattern: rule[2].trim() });
  }
  return rules;
}

/**
 * RFC 9309 §2.2.2 defines two special characters: `*` matches any sequence, and `$` anchors the
 * match to the end of the path — but only as the pattern's final character, which is what the
 * reference implementation the RFC codifies checks. A `$` anywhere else is a literal dollar sign.
 */
function patternToRegex(pattern: string): RegExp {
  const anchored = pattern.endsWith('$');
  const body = anchored ? pattern.slice(0, -1) : pattern;
  const literal = body.split('*').map((s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('.*');
  return new RegExp('^' + literal + (anchored ? '$' : ''));
}

/**
 * Most specific match wins, measured in pattern octets, and an allow beats an equally specific
 * disallow (RFC 9309 §2.2.2). Paths this crawler builds are ASCII slugs, so the RFC's
 * percent-encode-before-comparing step is skipped: a rule naming a non-ASCII path would fail to
 * match and permit the crawl, which is the wrong direction — but no path we construct can reach it.
 */
export function isPathAllowed(rules: RobotsRule[], path: string): boolean {
  let best: RobotsRule | null = null;
  for (const rule of rules) {
    if (!patternToRegex(rule.pattern).test(path)) continue;
    if (best === null || rule.pattern.length > best.pattern.length
      || (rule.pattern.length === best.pattern.length && rule.allow)) best = rule;
  }
  return best === null || best.allow;
}
