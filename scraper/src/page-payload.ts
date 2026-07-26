import { decodeDevalue, DevalueError } from './devalue.js';

export class PayloadError extends Error {}

export interface PagePayload {
  pageType: string;
  entityId: number | null;
  pageData: Record<string, any>;
}

export function extractPagePayload(html: string): PagePayload {
  const m = html.match(/<script[^>]*id="__NUXT_DATA__"[^>]*>([\s\S]*?)<\/script>/);
  if (!m || !m[1]) throw new PayloadError('__NUXT_DATA__ script tag not found');
  let raw: unknown;
  try {
    raw = JSON.parse(m[1]);
  } catch {
    throw new PayloadError('__NUXT_DATA__ is not valid JSON');
  }
  let root: any;
  try {
    root = decodeDevalue(raw as unknown[]);
  } catch (e) {
    if (e instanceof DevalueError) throw new PayloadError(`devalue decode failed: ${e.message}`);
    throw e;
  }
  const entries = root?.data && typeof root.data === 'object' ? Object.values<any>(root.data) : [];
  const entry = entries.find((e) => e && typeof e === 'object' && 'page_data' in e);
  if (!entry?.page_data) throw new PayloadError('no data entry with page_data found');
  return {
    pageType: String(entry.page_type ?? ''),
    entityId: typeof entry.entity_id === 'number' ? entry.entity_id : null,
    pageData: entry.page_data,
  };
}
