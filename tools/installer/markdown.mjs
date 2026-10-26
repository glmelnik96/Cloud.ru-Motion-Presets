// The Markdown the editors' guide uses (docs/guide/panel.md), as HTML for its PDF in the package: headings,
// paragraphs, lists (one level of nesting, a list item's lines that follow it), tables, **bold** and `code`.
// Nothing else is needed there; anything else comes out as plain text.

const esc = (s) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
export const inline = (s) => esc(s).replace(/`([^`]+)`/g, '<code>$1</code>').replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');

const LIST = /^( *)([-*]|\d+\.) (.*)$/;
const indentOf = (line) => line.length - line.trimStart().length;

export function markdownToHtml(md) {
  const lines = md.replace(/\r\n/g, '\n').replace(/^﻿/, '').split('\n');
  const out = [];
  let i = 0;
  while (i < lines.length) {
    const line = lines[i];
    if (!line.trim()) { i += 1; continue; }
    const h = /^(#{1,4}) (.*)$/.exec(line);
    if (h) { out.push(`<h${h[1].length}>${inline(h[2])}</h${h[1].length}>`); i += 1; continue; }
    if (line.startsWith('|')) {
      const rows = [];
      while (i < lines.length && lines[i].startsWith('|')) rows.push(lines[i++]);
      const cells = (r) => r.trim().replace(/^\||\|$/g, '').split('|').map((c) => inline(c.trim()));
      const body = rows.filter((r, k) => !(k === 1 && /^\|[\s:|-]+\|$/.test(r.trim())));
      out.push('<table><thead><tr>' + cells(body[0]).map((c) => `<th>${c}</th>`).join('') + '</tr></thead><tbody>'
        + body.slice(1).map((r) => '<tr>' + cells(r).map((c) => `<td>${c}</td>`).join('') + '</tr>').join('') + '</tbody></table>');
      continue;
    }
    if (LIST.test(line)) {
      // items of the top list, each with its own lines: a nested list, or text that continues it
      const top = indentOf(line);
      const items = [];
      while (i < lines.length) {
        const l = lines[i];
        if (!l.trim()) {
          // a blank line ends the list unless the list goes on after it
          const next = lines.slice(i + 1).find((x) => x.trim());
          if (next && (LIST.test(next) && indentOf(next) >= top) || (next && indentOf(next) > top && items.length)) { i += 1; continue; }
          break;
        }
        const m = LIST.exec(l);
        if (m && indentOf(l) === top) { items.push({ ordered: /\d/.test(m[2]), text: [m[3]], sub: [] }); i += 1; continue; }
        if (indentOf(l) > top && items.length) { items[items.length - 1].sub.push(l.slice(top + 2)); i += 1; continue; }
        break;
      }
      const ordered = items[0].ordered;
      out.push(`<${ordered ? 'ol' : 'ul'}>` + items.map((it) => {
        const sub = it.sub.join('\n');
        const nested = it.sub.some((s) => LIST.test(s)) ? markdownToHtml(sub) : it.sub.length ? `<p>${inline(it.sub.map((s) => s.trim()).join(' '))}</p>` : '';
        return `<li>${inline(it.text.join(' '))}${nested}</li>`;
      }).join('') + `</${ordered ? 'ol' : 'ul'}>`);
      continue;
    }
    const para = [];
    while (i < lines.length && lines[i].trim() && !LIST.test(lines[i]) && !/^#{1,4} /.test(lines[i]) && !lines[i].startsWith('|')) para.push(lines[i++].trim());
    out.push(`<p>${inline(para.join(' '))}</p>`);
  }
  return out.join('\n');
}
