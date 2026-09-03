// Plain-text helpers for the details crawl. The editorial fields and the feature/fact
// vocabulary are plain text by contract — the app interpolates them, it never renders them as
// markup (docs/app.md §Sanitised-HTML boundary) — so entity escapes and nested link shapes have
// to be resolved here rather than at the render site.

const NAMED: Record<string, string> = {
  amp: '&', lt: '<', gt: '>', quot: '"', apos: "'",
  // A non-breaking space is decoded to a plain one: these strings are searched and filtered,
  // and an invisible U+00A0 inside a pro or a con silently fails a substring match.
  nbsp: ' ',
  ndash: '–', mdash: '—', hellip: '…', bull: '•', middot: '·', deg: '°', times: '×',
  lsquo: '‘', rsquo: '’', ldquo: '“', rdquo: '”', sbquo: '‚', bdquo: '„',
  aacute: 'á', eacute: 'é', iacute: 'í', oacute: 'ó', uacute: 'ú',
  agrave: 'à', egrave: 'è', igrave: 'ì', ograve: 'ò', ugrave: 'ù',
  acirc: 'â', ecirc: 'ê', icirc: 'î', ocirc: 'ô', ucirc: 'û',
  auml: 'ä', euml: 'ë', iuml: 'ï', ouml: 'ö', uuml: 'ü',
  ntilde: 'ñ', ccedil: 'ç', aring: 'å', oslash: 'ø', szlig: 'ß',
  copy: '©', reg: '®', trade: '™', frac12: '½', frac14: '¼', prime: '′', Prime: '″',
};

const ENTITY = /&(?:#x([0-9a-fA-F]+)|#([0-9]+)|([a-zA-Z][a-zA-Z0-9]*));/g;
const MAX_CODE_POINT = 0x10ffff;

/**
 * One left-to-right pass, so each escape is decoded exactly once: `&amp;lt;` is the literal
 * text "&lt;" and must stay that way rather than becoming a `<` a second pass would forge.
 * Anything unrecognised or out of range is left verbatim — a stray `&` is far likelier to be
 * real prose than a broken escape.
 */
export function decodeEntities(text: string): string {
  if (!text.includes('&')) return text;
  return text.replace(ENTITY, (match, hex: string | undefined, dec: string | undefined, name: string | undefined) => {
    if (name !== undefined) return Object.hasOwn(NAMED, name) ? NAMED[name]! : match;
    const code = Number.parseInt(hex ?? dec!, hex !== undefined ? 16 : 10);
    // Surrogate halves are not characters; `String.fromCodePoint` would emit a lone one.
    if (!Number.isFinite(code) || code <= 0 || code > MAX_CODE_POINT || (code >= 0xd800 && code <= 0xdfff)) return match;
    return String.fromCodePoint(code);
  });
}

export interface FactValue {
  slug: string;
  text: string;
}

function plainText(v: unknown): string | null {
  if (typeof v === 'string') return v;
  if (typeof v === 'number' && Number.isFinite(v)) return String(v);
  return null;
}

function slugify(text: string): string {
  return text.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
}

/**
 * Normalises one fact's `values` array. A value's `text` is a bare string on some facts
 * (`terrain`, `features`) and an array of link objects on others (`pace`, `width`, `material`,
 * `collection`); the nested shape carries the useful slugs one level down, so it is flattened
 * onto its own entries rather than joined. Values repeat — the `width` fact lists a SKU width
 * once per size run — so the result is deduped, first occurrence winning
 * (docs/scraping.md §Fact values).
 */
export function factValues(values: unknown): FactValue[] {
  if (!Array.isArray(values)) return [];
  const out: FactValue[] = [];
  const seen = new Set<string>();
  const push = (rawSlug: unknown, rawText: string): void => {
    const text = decodeEntities(rawText).trim();
    if (text === '') return;
    const slug = typeof rawSlug === 'string' && rawSlug !== '' ? rawSlug : slugify(text);
    if (slug.trim() === '' || seen.has(slug)) return;
    seen.add(slug);
    out.push({ slug, text });
  };
  for (const v of values) {
    const flat = plainText((v as any)?.text);
    if (flat !== null) {
      push((v as any)?.slug, flat);
      continue;
    }
    if (!Array.isArray((v as any)?.text)) continue;
    for (const nested of (v as any).text) {
      const text = plainText(nested?.text);
      if (text !== null) push(nested?.slug, text);
    }
  }
  return out;
}
