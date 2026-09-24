// A csv, read. import.html and you.html both load this file, so a file is only ever read one way.
//
// A row is split on commas outside quotes. The date column is the one where the most cells read as
// dates, as long as more of them read as dates than as plain numbers. A number column is every other
// column that holds a number at all: a cell that is empty or is not a number is that row's silence, not
// the column's, so a column a real export leaves blank on most days is still offered. Nothing here names
// a metric: that is the page's to ask and yours to say.

function parseCSV(text) {
  const rows = [[]];
  let field = '', quoted = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (quoted) {
      if (c === '"' && text[i + 1] === '"') { field += '"'; i++; }
      else if (c === '"') quoted = false;
      else field += c;
    } else if (c === '"') quoted = true;
    else if (c === ',') { rows[rows.length - 1].push(field); field = ''; }
    else if (c === '\n') { rows[rows.length - 1].push(field); field = ''; rows.push([]); }
    else if (c !== '\r') field += c;
  }
  rows[rows.length - 1].push(field);
  return rows.filter(r => r.some(v => v.trim() !== ''));
}

const csvDate = v => v.trim() !== '' && !isNaN(Date.parse(v));
const csvNum  = v => v.trim() !== '' && !isNaN(Number(v));

// The file's header, its rows, which column holds the dates and which hold numbers: { head, body,
// dateCol, columns: [{ col, label, n }] }, n the cells in that column that are numbers. Or { error }.
// A stock's name, from a column's label or from something typed: lower case,
// one underscore for every run of anything else. Both CSV doors read it here,
// so a name made from a column and a name typed on the page are one rule.
const slugMetric = s => String(s == null ? '' : s).toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '');

function readCSV(text) {
  if (text.startsWith('PK\u0003\u0004')) return { error: 'A zip file. Open it and drop a CSV from inside.' };
  const rows = parseCSV(text);
  if (rows.length && /^sep=.?$/i.test(rows[0].join(',').trim())) rows.shift();   // Excel's delimiter hint, not a header
  if (!rows.length) return { error: 'No rows found.' };
  const head = rows[0].map(h => h.trim());
  const body = rows.slice(1);
  if (head.length === 1 && body.some(r => r.length > 1)) return { error: 'The header is not on the first line: this file has a title row above it.' };

  let dateCol = -1, best = 0;
  head.forEach((_, c) => {
    const hits = body.filter(r => csvDate(r[c] || '')).length;
    const nums = body.filter(r => csvNum(r[c] || '')).length;
    // a column of plain numbers is not a date column
    if (hits > best && hits > nums) { best = hits; dateCol = c; }
  });
  if (dateCol === -1) return { error: 'No date column found.' };

  const columns = [];
  head.forEach((h, c) => {
    if (c === dateCol) return;
    const n = body.filter(r => csvNum(r[c] || '')).length;
    if (n > 0) columns.push({ col: c, label: h, n });
  });
  if (!columns.length) return { error: 'No number columns found.' };

  return { head, body, dateCol, columns };
}
