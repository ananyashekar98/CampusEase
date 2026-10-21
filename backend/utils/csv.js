// A small, dependency-free CSV parser — handles quoted fields (so a name or
// address containing a comma doesn't break column alignment) without
// pulling in a full CSV library for one admin screen.

function parseCsv(text) {
  const rows = [];
  let row = [];
  let field = '';
  let inQuotes = false;

  const pushField = () => {
    row.push(field);
    field = '';
  };
  const pushRow = () => {
    pushField();
    rows.push(row);
    row = [];
  };

  const normalized = text.replace(/\r\n/g, '\n').replace(/\r/g, '\n');

  for (let i = 0; i < normalized.length; i += 1) {
    const char = normalized[i];

    if (inQuotes) {
      if (char === '"') {
        if (normalized[i + 1] === '"') {
          field += '"';
          i += 1;
        } else {
          inQuotes = false;
        }
      } else {
        field += char;
      }
      continue;
    }

    if (char === '"') {
      inQuotes = true;
    } else if (char === ',') {
      pushField();
    } else if (char === '\n') {
      pushRow();
    } else {
      field += char;
    }
  }
  // Final field/row if the text doesn't end with a newline
  if (field.length > 0 || row.length > 0) {
    pushRow();
  }

  return rows.filter((r) => r.length > 1 || (r.length === 1 && r[0].trim() !== ''));
}

// Converts parsed rows (first row = header) into an array of plain objects
// keyed by lower-cased, trimmed header names.
function csvToObjects(text) {
  const rows = parseCsv(text);
  if (rows.length === 0) return [];
  const headers = rows[0].map((h) => h.trim().toLowerCase());
  return rows.slice(1).map((row) => {
    const obj = {};
    headers.forEach((h, idx) => {
      obj[h] = (row[idx] || '').trim();
    });
    return obj;
  });
}

module.exports = { parseCsv, csvToObjects };
