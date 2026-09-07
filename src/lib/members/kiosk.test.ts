import { describe, expect, it } from "vitest";
import {
  contributionCounts,
  defaultMeeting,
  distinguish,
  indistinguishable,
  initials,
  meetingLabel,
  offerableMeetings,
  searchCandidates,
  discordHandle,
  shownName,
  type Candidate,
} from "./kiosk";
import type { ContributionRecord, MeetingRecord, Person } from "./records";

function person(over: Partial<Person> & { name: string }): Person {
  return {
    pageId: over.name,
    discordId: null,
    email: null,
    status: null,
    ...over,
  };
}

const candidate = (over: Partial<Person> & { name: string }, credits = 0) =>
  ({ person: person(over), contributions: credits }) satisfies Candidate;

function meeting(date: string, name = date): MeetingRecord {
  return { pageId: name, name, date, type: "General Body", attendeeIds: [] };
}

describe("searchCandidates", () => {
  const roster = [
    candidate({ name: "Joanna Reed" }),
    candidate({ name: "Ann Marie Diaz" }),
    candidate({ name: "Zoë O'Brien" }),
  ];

  it("offers nothing until something is typed", () => {
    expect(searchCandidates(roster, "")).toEqual([]);
    expect(searchCandidates(roster, "   ")).toEqual([]);
  });

  it("ranks a prefix match above an infix one", () => {
    expect(searchCandidates(roster, "ann").map((c) => c.person.name)).toEqual([
      "Ann Marie Diaz",
      "Joanna Reed",
    ]);
  });

  it("ignores case, accents and punctuation, which nobody types standing up", () => {
    expect(searchCandidates(roster, "zoe obrien")).toHaveLength(1);
    expect(searchCandidates(roster, "ZOE")).toHaveLength(1);
  });

  it("caps the list so the screen stays tappable", () => {
    const many = Array.from({ length: 20 }, (_, i) =>
      candidate({ name: `Sam ${i}` }),
    );
    expect(searchCandidates(many, "sam", 5)).toHaveLength(5);
  });
});

describe("distinguish", () => {
  it("shows the whole address, because two people share a domain", () => {
    expect(
      distinguish(candidate({ name: "Sam", email: "sam@terpmail.umd.edu" })),
    ).toBe("sam@terpmail.umd.edu");
  });

  it("says so when there is no email, because that row is the likely duplicate", () => {
    expect(distinguish(candidate({ name: "Sam" }))).toBe("no email on file");
  });

  it("counts contributions and names a status when there is one", () => {
    expect(
      distinguish(
        candidate({ name: "Sam", email: "s@umd.edu", status: "Grad" }, 1),
      ),
    ).toBe("s@umd.edu · 1 contribution · Grad");
  });
});

describe("indistinguishable", () => {
  it("is true for two rows a person could not choose between", () => {
    expect(
      indistinguishable(
        candidate({ name: "Sam Lee" }),
        candidate({ name: "sam lee" }),
      ),
    ).toBe(true);
  });

  it("is false once anything separates them", () => {
    expect(
      indistinguishable(
        candidate({ name: "Sam Lee", email: "a@umd.edu" }),
        candidate({ name: "Sam Lee" }),
      ),
    ).toBe(false);
  });
});

describe("defaultMeeting", () => {
  it("picks today's meeting", () => {
    const today = meeting("2026-09-07");
    expect(defaultMeeting([meeting("2026-08-31"), today], "2026-09-07")).toBe(
      today,
    );
  });

  it("never opens on a future meeting, which would misfile tonight's room", () => {
    const past = meeting("2026-08-31");
    expect(defaultMeeting([past, meeting("2026-09-14")], "2026-09-07")).toBe(
      past,
    );
  });

  it("compares a timestamped date by its day", () => {
    const timed = meeting("2026-09-07T19:00:00.000-04:00");
    expect(defaultMeeting([timed], "2026-09-07")).toBe(timed);
  });

  it("is null when nothing has happened yet", () => {
    expect(defaultMeeting([meeting("2026-12-01")], "2026-09-07")).toBeNull();
    expect(defaultMeeting([], "2026-09-07")).toBeNull();
  });
});

describe("contributionCounts", () => {
  it("counts a byline and an image credit alike, per ADR 0010", () => {
    const articles: ContributionRecord[] = [
      {
        pageId: "a",
        headline: "one",
        date: "2026-01-01",
        authorIds: ["sam"],
        imageCrewIds: ["ada"],
      },
      {
        pageId: "b",
        headline: "two",
        date: "2026-02-01",
        authorIds: ["sam"],
        imageCrewIds: ["sam"],
      },
    ];

    /* credited on both sides of one article legitimately counts twice */
    expect(contributionCounts(articles).get("sam")).toBe(3);
    expect(contributionCounts(articles).get("ada")).toBe(1);
  });
});

describe("meetingLabel", () => {
  it("strips the trailing date the calendar puts in the name", () => {
    expect(meetingLabel("General Body Meeting 2026-09-08")).toBe(
      "General Body Meeting",
    );
    expect(meetingLabel("Volunteer Event – 2026-09-08")).toBe(
      "Volunteer Event",
    );
  });

  it("leaves a date anywhere but the end alone", () => {
    expect(meetingLabel("2026-09-08 kickoff")).toBe("2026-09-08 kickoff");
  });

  it("keeps a name that is only a date, rather than rendering nothing", () => {
    expect(meetingLabel("2026-09-08")).toBe("2026-09-08");
  });
});

describe("offerableMeetings", () => {
  const calendar = [
    meeting("2026-09-20"),
    meeting("2026-09-01"),
    meeting("2026-08-20"),
    meeting("2026-03-04"),
  ];

  it("offers the past month and everything ahead, newest first", () => {
    expect(
      offerableMeetings(calendar, "2026-09-08").map((one) => one.date),
    ).toEqual(["2026-09-20", "2026-09-01", "2026-08-20"]);
  });

  it("still offers a meeting outside the window when it is the pinned one", () => {
    const offered = offerableMeetings(calendar, "2026-09-08", "2026-03-04");

    expect(offered.map((one) => one.date)).toContain("2026-03-04");
  });

  it("drops an undated row, which cannot be signed into", () => {
    expect(offerableMeetings([meeting("")], "2026-09-08")).toEqual([]);
  });
});

describe("initials", () => {
  it("takes the first and last name, skipping the middle ones", () => {
    expect(initials("Mary Kate Ellis")).toBe("ME");
    expect(initials("Joanna Reed")).toBe("JR");
  });

  it("gives a single name one letter rather than doubling it", () => {
    expect(initials("Prince")).toBe("P");
  });

  it("has nothing to show for an empty name", () => {
    expect(initials("   ")).toBe("");
  });
});

describe("shownName and discordHandle", () => {
  const face = {
    "1": {
      username: "zsrobinson",
      displayName: "Zach (EIC)",
      avatarUrl: "https://cdn.discordapp.com/avatars/1.png",
    },
  };

  /* the handle names the linked account and belongs on the chip. as a title it
     hid the name somebody walks up to the kiosk looking for */
  it("titles a row with the notion name even when a discord row is linked", () => {
    expect(
      shownName(person({ name: "Zachary Robinson", discordId: "1" })),
    ).toBe("Zachary Robinson");
  });

  it("gives the chip the discord handle where the row is linked", () => {
    expect(
      discordHandle(person({ name: "Zachary Robinson", discordId: "1" }), face),
    ).toBe("zsrobinson");
  });

  it("has no handle where nothing is linked", () => {
    expect(
      discordHandle(person({ name: "Zachary Robinson" }), face),
    ).toBeNull();
  });

  it("has no handle where the guild read did not resolve the id", () => {
    expect(
      discordHandle(person({ name: "Sam Lee", discordId: "2" }), face),
    ).toBeNull();
  });
});
