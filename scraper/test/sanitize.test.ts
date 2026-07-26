import { describe, expect, it } from 'vitest';
import { sanitizeHtml } from '../src/sanitize.js';

describe('sanitizeHtml', () => {
  it('keeps allowed tags, strips others but keeps their text', () => {
    expect(sanitizeHtml('<p>Hi <strong>there</strong> <span data-x="1">friend</span></p>'))
      .toBe('<p>Hi <strong>there</strong> friend</p>');
    expect(sanitizeHtml('<ul><li>one</li><li>two</li></ul>')).toBe('<ul><li>one</li><li>two</li></ul>');
  });
  it('removes script/style including content', () => {
    expect(sanitizeHtml('a<script>alert(1)</script>b<style>p{}</style>c')).toBe('abc');
  });
  it('keeps only absolute http(s) hrefs on <a>, strips other attributes', () => {
    expect(sanitizeHtml('<a href="https://runrepeat.com/x" onclick="evil()">x</a>'))
      .toBe('<a href="https://runrepeat.com/x" rel="noopener" target="_blank">x</a>');
    expect(sanitizeHtml('<a href="javascript:evil()">x</a>')).toBe('<a>x</a>');
    expect(sanitizeHtml('<a href="/relative">x</a>')).toBe('<a>x</a>');
  });
  it('handles img and headings by dropping tags', () => {
    expect(sanitizeHtml('<h4>Title</h4><img src="x.jpg"><em>ok</em>')).toBe('Title<em>ok</em>');
  });
});

describe('sanitizeHtml hardening', () => {
  it('does not let a single-quoted href inject extra attributes', () => {
    const out = sanitizeHtml(`<a href='https://x.com/" onmouseover="alert(1)'>x</a>`);
    const openTag = out.slice(0, out.indexOf('>') + 1);
    expect(openTag.match(/"/g)).toHaveLength(6); // exactly three quoted attributes, no breakout
    expect(out).toBe(
      '<a href="https://x.com/&quot; onmouseover=&quot;alert(1)" rel="noopener" target="_blank">x</a>',
    );
  });
  it('escapes markup characters inside the href value', () => {
    expect(sanitizeHtml(`<a href='https://x.com/><img src=x onerror=alert(1)>'>x</a>`)).toBe(
      '<a href="https://x.com/&gt;&lt;img src=x onerror=alert(1)&gt;" rel="noopener" target="_blank">x</a>',
    );
  });
  it('leaves entities in the href alone rather than double-encoding them', () => {
    expect(sanitizeHtml('<a href="https://x.com/?a=1&amp;b=2">x</a>')).toBe(
      '<a href="https://x.com/?a=1&amp;b=2" rel="noopener" target="_blank">x</a>',
    );
  });
  it('escapes stray < so a malformed tag cannot pass through raw', () => {
    // Unbalanced quote in the attribute list: the tag regex cannot match it, and browsers
    // still tokenise `x"y` as an attribute name, so raw passthrough would keep the handler.
    expect(sanitizeHtml('<p x"y onclick=alert(1)>hover</p>')).toBe('&lt;p x"y onclick=alert(1)>hover</p>');
    expect(sanitizeHtml('<scr<script>ipt>alert(1)</script>')).toBe('&lt;scr');
    expect(sanitizeHtml('5 < 6')).toBe('5 &lt; 6');
  });
  it('drops attributes and comments regardless of case', () => {
    expect(sanitizeHtml('<P ONCLICK="alert(1)">hi</P>')).toBe('<p>hi</p>');
    expect(sanitizeHtml('a<SCRIPT>alert(1)</script>b')).toBe('ab');
    expect(sanitizeHtml('<!-- <b>c</b> --><p>ok</p>')).toBe('<p>ok</p>');
    expect(sanitizeHtml('<IMG SRC=x ONERROR=alert(1)>')).toBe('');
  });
  it('rejects non-http schemes and unquoted hrefs', () => {
    expect(sanitizeHtml('<a href="JavaScript:alert(1)">x</a>')).toBe('<a>x</a>');
    expect(sanitizeHtml('<a href="  https://x.com">x</a>')).toBe('<a>x</a>');
    expect(sanitizeHtml('<a href=https://x.com onclick=alert(1)>x</a>')).toBe('<a>x</a>');
    expect(sanitizeHtml('<a href="https://x.com"/>x')).toBe(
      '<a href="https://x.com" rel="noopener" target="_blank">x',
    );
  });
});
