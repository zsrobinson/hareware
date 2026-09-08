import { expect, test } from "vitest";
import { compareToGroup, emailsInExport, isExternalAddress } from "./group";
import type { Person } from "./records";

const person = (fields: Partial<Person> & { pageId: string }): Person => ({
  name: "Somebody",
  discordId: null,
  email: null,
  status: "Undergrad",
  contributions: 0,
  ...fields,
});

/* the shape google actually exports, header row and all */
const EXPORT = `Email address,Nickname,Join date,Posting permissions
ana@terpmail.umd.edu,Ana,2026-01-04,allowed
ben@umd.edu,,2026-02-11,allowed
"quoted@terpmail.umd.edu",Quoted,2026-03-01,allowed
`;

test("every address in an export is found, whatever the columns are", () => {
  expect([...emailsInExport(EXPORT)]).toEqual([
    "ana@terpmail.umd.edu",
    "ben@umd.edu",
    "quoted@terpmail.umd.edu",
  ]);
});

/* the column names have changed before and are not ours to depend on. a reader
   that looked for one and found nothing would report an empty group, which
   reads as "add everybody again" rather than as a failure */
test("a file with no header is read the same way", () => {
  expect([...emailsInExport("ana@terpmail.umd.edu\nben@umd.edu")]).toEqual([
    "ana@terpmail.umd.edu",
    "ben@umd.edu",
  ]);
});

test("addresses are folded to lower case, and each is listed once", () => {
  const found = emailsInExport("Ana@Terpmail.UMD.edu, ana@terpmail.umd.edu");

  expect([...found]).toEqual(["ana@terpmail.umd.edu"]);
});

test("a file with nothing in it finds nothing rather than throwing", () => {
  expect(emailsInExport("").size).toBe(0);
});

test("somebody on the roster and not in the group is missing", () => {
  const diff = compareToGroup(
    [
      person({ pageId: "p1", name: "Ana", email: "ana@terpmail.umd.edu" }),
      person({ pageId: "p2", name: "Ben", email: "ben@umd.edu" }),
    ],
    new Set(["ana@terpmail.umd.edu"]),
  );

  expect(diff.missing.map((one) => one.name)).toEqual(["Ben"]);
});

/* the address on the row was typed by a person, the one in the group came back
   from google, and either may carry capitals or a stray space */
test("a difference of case or whitespace is not a difference", () => {
  const diff = compareToGroup(
    [person({ pageId: "p1", email: "  Ana@Terpmail.umd.edu " })],
    new Set(["ana@terpmail.umd.edu"]),
  );

  expect(diff.missing).toEqual([]);
});

/*
  a row with no address is neither in the group nor addable to it, and the
  earlier version of this page filtered those rows out before counting. That is
  the silent omission ADR 0010 keeps refusing: somebody nobody can reach looks
  exactly like somebody already reached
*/
test("a row with no email is named, not counted as present", () => {
  const diff = compareToGroup(
    [
      person({ pageId: "p1", name: "Ana", email: "ana@terpmail.umd.edu" }),
      person({ pageId: "p2", name: "No Address", email: null }),
      person({ pageId: "p3", name: "Blank", email: "   " }),
    ],
    new Set(["ana@terpmail.umd.edu"]),
  );

  expect(diff.missing).toEqual([]);
  expect(diff.unreachable.map((one) => one.name)).toEqual([
    "No Address",
    "Blank",
  ]);
});

/* alumni, mostly. but a typo in a notion email looks exactly the same from
   here, which is why they are shown rather than dropped */
test("an address in the group that no row claims is reported", () => {
  const diff = compareToGroup(
    [person({ pageId: "p1", email: "ana@terpmail.umd.edu" })],
    new Set(["ana@terpmail.umd.edu", "graduated@gmail.com"]),
  );

  expect(diff.strangers).toEqual(["graduated@gmail.com"]);
});

test("an empty group makes everybody with an address missing", () => {
  const diff = compareToGroup(
    [
      person({ pageId: "p1", name: "Ana", email: "ana@terpmail.umd.edu" }),
      person({ pageId: "p2", name: "Ben", email: "ben@umd.edu" }),
    ],
    new Set(),
  );

  expect(diff.missing).toHaveLength(2);
  expect(diff.strangers).toEqual([]);
});

test("the university's own domains are not external", () => {
  expect(isExternalAddress("bay@terpmail.umd.edu")).toBe(false);
  expect(isExternalAddress("bay@umd.edu")).toBe(false);
});

test("anything else is, including an address we do not have", () => {
  expect(isExternalAddress("bay@gmail.com")).toBe(true);
  expect(isExternalAddress("bay@cs.umd.edu")).toBe(true);
  expect(isExternalAddress(null)).toBe(true);
});
