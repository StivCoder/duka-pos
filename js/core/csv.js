/** Minimal RFC-4180 parser (quotes, commas and newlines inside quotes, BOM). Throws on an unclosed quote. */
export function parseCsv(text) {
  const rows = []; let row = [], f = '', q = false; text = text.replace(/^\uFEFF/, '');
  const endRow = () => { row.push(f); f = ''; if (row.some((x) => x !== '')) rows.push(row); row = []; };
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (q) { if (c === '"') { if (text[i + 1] === '"') { f += '"'; i++; } else q = false; } else f += c; }
    else if (c === '"') q = true;
    else if (c === ',') { row.push(f); f = ''; }
    else if (c === '\n' || c === '\r') { if (c === '\r' && text[i + 1] === '\n') i++; endRow(); }
    else f += c;
  }
  if (q) throw new Error('The file has an unclosed quote.');
  endRow(); return rows;
}
/** Quotes a CSV cell; text starting with = + - @ is prefixed so spreadsheets cannot run it as a formula. */
export const csvCell = (v) => { let s = String(v ?? ''); if (typeof v === 'string' && /^[=+\-@\t\r]/.test(s)) s = "'" + s; return '"' + s.replace(/"/g, '""') + '"'; };
