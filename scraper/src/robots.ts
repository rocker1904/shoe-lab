export function parseRobots(txt: string): string[] {
  const rules: string[] = [];
  let inStar = false;
  for (const raw of txt.split(/\r?\n/)) {
    const line = raw.trim();
    const ua = /^user-agent:\s*(.+)$/i.exec(line);
    if (ua) { inStar = ua[1]!.trim() === '*'; continue; }
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
