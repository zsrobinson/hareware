/*
  turning rows into a csv a spreadsheet will open without lying about them.

  this is a pure function so the escaping can be tested, because every one of
  the rules below is a case somebody got wrong somewhere and only found out
  when a name with a comma in it silently became two columns.

  it lives outside `data-table.tsx` for that reason alone: the table is a react
  component, and the part of the export that can actually be wrong is not.
*/

/**
 * characters that make excel and google sheets treat a cell as a formula.
 *
 * a cell beginning with one of these is evaluated on open, so a Members row
 * named `=cmd|' /c calc'!A1` becomes code running on whoever opened the export
 * — CSV injection, and the reason a roster export is a plausible carrier for
 * it: the values come from a kiosk that a room full of people types into.
 *
 * tab and carriage return are here too because sheets strips leading
 * whitespace before deciding, so `\t=1+1` is still a formula
 */
const FORMULA = ["=", "+", "-", "@", "\t", "\r"];

/**
 * one value, escaped for csv.
 *
 * two separate jobs, in this order:
 *
 * 1. a leading formula character is neutralised with a single quote, which is
 *    the convention both excel and sheets understand as "this is text". done
 *    *before* quoting, so the guard ends up inside the quotes where the
 *    spreadsheet will see it rather than in the file's syntax.
 * 2. anything containing a quote, a comma, a newline or a carriage return is
 *    wrapped in double quotes with its own quotes doubled, per RFC 4180.
 *
 * a value that needed neither comes back untouched, so an export a human reads
 * in a terminal is not covered in quotes it does not need
 */
export function csvCell(value: unknown): string {
  const raw = text(value);

  const guarded = FORMULA.some((char) => raw.startsWith(char))
    ? `'${raw}`
    : raw;

  return /["\n\r,]/.test(guarded)
    ? `"${guarded.replaceAll('"', '""')}"`
    : guarded;
}

/**
 * one value as the text of a cell.
 *
 * three cases rather than a bare `String()`:
 *
 * - null and undefined are an empty cell, not the strings "null"/"undefined".
 *   a roster where a missing email reads `null` is worse than a blank one.
 * - an array is joined with a semicolon, because a comma is the column
 *   separator and the values that arrive as arrays here are lists a human
 *   reads — the standing page's reasons, for one.
 * - anything else object-shaped is json rather than `[object Object]`, which
 *   is a bug report nobody can act on. a function is the same mistake made
 *   differently — a column that handed over its accessor instead of its
 *   value — and its source text has no business in a roster export, so it is
 *   an empty cell
 */
function text(value: unknown): string {
  if (value === null || value === undefined) return "";
  if (typeof value === "function") return "";
  if (Array.isArray(value)) return value.map(text).join("; ");
  if (typeof value === "object") return JSON.stringify(value);
  if (typeof value === "string") return value;
  /*
    each primitive named rather than one `String(value)` over what is left.
    the catch-all reads fine and is how a symbol — which has no text a
    spreadsheet should show — ends up in a cell, and it is the same shape of
    mistake the object branch above exists to stop
  */
  if (
    typeof value === "number" ||
    typeof value === "bigint" ||
    typeof value === "boolean"
  )
    return value.toString();

  return "";
}

/**
 * a header row and body rows as one csv document.
 *
 * `\r\n` because RFC 4180 says so and because excel on windows is the one
 * consumer that still notices. a trailing newline is included so a file
 * concatenated with another does not join two rows into one
 */
export function toCsv(headers: string[], rows: unknown[][]): string {
  return [headers, ...rows]
    .map((row) => row.map(csvCell).join(","))
    .join("\r\n")
    .concat("\r\n");
}
