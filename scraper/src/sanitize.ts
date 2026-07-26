const ALLOWED = new Set(['p', 'ul', 'ol', 'li', 'strong', 'em', 'a']);

// `value` is raw source text from between the original quotes, so entities in it are left as
// they are; only `"` can terminate the attribute we emit, and `<`/`>` are escaped defensively.
function escapeAttr(value: string): string {
  return value.replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

export function sanitizeHtml(html: string): string {
  let out = html.replace(/<(script|style)\b[^>]*>[\s\S]*?<\/\1>/gi, '');
  out = out.replace(/<!--[\s\S]*?-->/g, '');
  // Either a well-formed tag (replaced by its sanitised form, or dropped) or a bare `<`,
  // which is escaped so malformed markup can never reach the browser as a tag.
  out = out.replace(/<\/?([a-zA-Z][a-zA-Z0-9-]*)((?:[^>"']|"[^"]*"|'[^']*')*)\/?>|</g, (m, tag: string, attrs: string) => {
    if (m === '<') return '&lt;';
    const t = tag.toLowerCase();
    if (!ALLOWED.has(t)) return '';
    if (m.startsWith('</')) return `</${t}>`;
    if (t === 'a') {
      const href = /href\s*=\s*(?:"([^"]*)"|'([^']*)')/i.exec(attrs);
      const url = href?.[1] ?? href?.[2] ?? '';
      return /^https?:\/\//i.test(url) ? `<a href="${escapeAttr(url)}" rel="noopener" target="_blank">` : '<a>';
    }
    return `<${t}>`;
  });
  return out.trim();
}
