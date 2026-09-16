// A csv, read. import.html and you.html both load this file, so a file is only ever read one way.
//
// A row is split on commas outside quotes. The date column is the one where the most cells read as
// dates, as long as more of them read as dates than as plain numbers. A number column is every other
// column where at least six cells in ten are numbers. Nothing here names a metric: that is the page's
// to ask and yours to say.

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
function readCSV(text) {
  const rows = parseCSV(text);
  if (!rows.length) return { error: 'No rows found.' };
  const head = rows[0].map(h => h.trim());
  const body = rows.slice(1);

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
    if (n >= body.length * 0.6) columns.push({ col: c, label: h, n });
  });
  if (!columns.length) return { error: 'No number columns found.' };

  return { head, body, dateCol, columns };
}
