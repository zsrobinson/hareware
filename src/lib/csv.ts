/* rows as a csv a spreadsheet opens safely. */

/**
 * a cell starting with one of these is evaluated as a formula on open (CSV
 * injection; kiosk input reaches exports). Sheets strips leading whitespace
 * first, so `\t=1+1` counts too
 */
const FORMULA = ["=", "+", "-", "@", "\t", "\r"];

/**
 * one value, escaped: a leading formula character gets a `'` guard, added
 * before RFC 4180 quoting so the guard lands inside the quotes
 */
function csvCell(value: unknown): string {
  const raw = text(value);

  const guarded = FORMULA.some((char) => raw.startsWith(char))
    ? `'${raw}`
    : raw;

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
