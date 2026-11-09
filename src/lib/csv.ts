/* rows as a csv, or a cell to paste, that a spreadsheet opens safely. */

/**
 * a cell starting with one of these is evaluated as a formula on open or on
 * paste (CSV injection; kiosk input and printed bylines reach exports).
 * Sheets strips leading whitespace first, so ` =1+1` and `\t=1+1` count too
 */
const FORMULA = /^\s*[=+\-@]|^[\t\r]/;

/** a cell's text as a spreadsheet must read it, as text: a formula start gets a `'` guard */
export const spreadsheetCell = (raw: string): string =>
  FORMULA.test(raw) ? `'${raw}` : raw;

/**
 * one value, escaped: the guard is added before RFC 4180 quoting so it
 * lands inside the quotes
 */
function csvCell(value: unknown): string {
  const guarded = spreadsheetCell(text(value));

  return /["\n\r,]/.test(guarded)
    ? `"${guarded.replaceAll('"', '""')}"`
    : guarded;
}

/** a cell's text: absent is empty, a list joins with `; `, an object is json */
function text(value: unknown): string {
  if (value === null || value === undefined) return "";
  if (typeof value === "function") return "";
  if (Array.isArray(value)) return value.map(text).join("; ");
  if (typeof value === "object") return JSON.stringify(value);
  if (typeof value === "string") return value;
  if (
    typeof value === "number" ||
    typeof value === "bigint" ||
    typeof value === "boolean"
  )
    return value.toString();

  return "";
}

/** a header row and body rows, CRLF per RFC 4180, with a trailing newline */
export function toCsv(headers: string[], rows: unknown[][]): string {
  return [headers, ...rows]
    .map((row) => row.map(csvCell).join(","))
    .join("\r\n")
    .concat("\r\n");
}
