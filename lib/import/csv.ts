/**
 * RFC 4180 CSV: quoted fields, doubled quotes inside them, and newlines inside
 * quotes — which Goodreads reviews are full of. A naive split on "\n" and ","
 * cuts a multi-paragraph review into several broken rows.
 *
 * Returns rows of raw strings. Line endings may be \r\n or \n; a trailing
 * newline does not produce an empty last row.
 */
export function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let quoted = false;
  let i = 0;

  // A byte-order mark would otherwise glue itself to the first header.
  if (text.charCodeAt(0) === 0xfeff) i = 1;

  for (; i < text.length; i++) {
    const c = text[i];
    if (quoted) {
      if (c === '"') {
        if (text[i + 1] === '"') {
          field += '"';
          i++;
        } else {
          quoted = false;
        }
      } else {
        field += c;
      }
    } else if (c === '"' && field === "") {
      quoted = true;
    } else if (c === ",") {
      row.push(field);
      field = "";
    } else if (c === "\n" || c === "\r") {
      if (c === "\r" && text[i + 1] === "\n") i++;
      row.push(field);
      rows.push(row);
      row = [];
      field = "";
    } else {
      field += c;
    }
  }

  if (quoted) throw new Error("The file ends inside a quoted field, so it is cut short or not CSV.");
  if (field !== "" || row.length > 0) {
    row.push(field);
    rows.push(row);
  }
  return rows;
}
