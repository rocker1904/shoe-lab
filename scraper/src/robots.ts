export function parseRobots(txt: string): string[] {
  const rules: string[] = [];
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
    const dis = /^disallow:\s*(.*)$/i.exec(line);
    if (dis && inStar && dis[1]) rules.push(dis[1].trim());
  }
  return rules;
}

export function isPathAllowed(rules: string[], path: string): boolean {
  return !rules.some((rule) => {
    const re = new RegExp('^' + rule.split('*').map((s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('.*'));
    return re.test(path);
  });
}
