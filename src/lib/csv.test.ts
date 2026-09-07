import { describe, expect, it } from "vitest";
import { csvCell, toCsv } from "./csv";

describe("csvCell", () => {
  it("leaves an ordinary value alone", () => {
    expect(csvCell("Zachary Robinson")).toBe("Zachary Robinson");
    expect(csvCell(3)).toBe("3");
  });

  it("writes a missing value as an empty cell rather than as prose", () => {
    expect(csvCell(null)).toBe("");
    expect(csvCell(undefined)).toBe("");
  });

  it("joins a list with semicolons, since a comma is the separator", () => {
    /* the standing page's reasons arrive as an array */
    expect(csvCell(["3 general body meetings", "2 contributions"])).toBe(
      "3 general body meetings; 2 contributions",
    );
  });

  it("writes an object as json rather than as [object Object]", () => {
    expect(csvCell({ name: "Ada" })).toBe('"{""name"":""Ada""}"');
  });

  it("quotes a value holding a comma", () => {
    expect(csvCell("Robinson, Zachary")).toBe('"Robinson, Zachary"');
  });

  it("doubles quotes inside a quoted value", () => {
    expect(csvCell('she said "hi"')).toBe('"she said ""hi"""');
  });

  it("quotes a value holding a newline, so one cell stays one cell", () => {
    expect(csvCell("two\nlines")).toBe('"two\nlines"');
    expect(csvCell("two\r\nlines")).toBe('"two\r\nlines"');
  });

  /* the injection cases: a spreadsheet evaluates any of these on open */
  it.each(["=1+1", "+1", "-1", "@SUM(A1)", "\t=1+1"])(
    "neutralises %j so a spreadsheet reads it as text",
    (formula) => {
      expect(csvCell(formula).replace(/^"|"$/g, "")).toMatch(/^'/);
    },
  );

  it("puts the guard inside the quotes, not outside them", () => {
    /* a comma as well as a formula start, so both rules fire at once. the
       apostrophe has to be part of the cell's *content* or the spreadsheet
       never sees it */
    expect(csvCell("=cmd|'/c calc'!A1, ok")).toBe(`"'=cmd|'/c calc'!A1, ok"`);
  });

  it("does not guard a value that merely contains a formula character", () => {
    expect(csvCell("3 - 2 = 1")).toBe("3 - 2 = 1");
  });
});

describe("toCsv", () => {
  it("joins a header row and body rows with CRLF and a trailing newline", () => {
    expect(
      toCsv(
        ["name", "meetings"],
        [
          ["Ada", 3],
          ["Grace", 0],
        ],
      ),
    ).toBe("name,meetings\r\nAda,3\r\nGrace,0\r\n");
  });

  it("escapes every cell, not only the first", () => {
    expect(toCsv(["a", "b"], [["ok", "=2+2"]])).toBe("a,b\r\nok,'=2+2\r\n");
  });
});
