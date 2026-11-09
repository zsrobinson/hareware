import { expect, test } from "vitest";
import { contributionsOn } from "~/lib/credits/person";
import {
  applyFilters,
  easternDate,
  grainOf,
  isPeriod,
  NO_FILTERS,
  periodOf,
  type Dimension,
  type Period,
  type Filters,
  type Grouped,
  type Member,
  type Unit,
} from "~/lib/credits/stats";
import {
  allows,
  COUNTS,
  DRAWS,
  GROUPINGS,
  groupOf,
  ORDERS,
  settle,
  SPLITS,
  TOPS,
  VALUES,
  type ChartConfig,
} from "./chart-config";
import type { ArchiveArticle } from "~/lib/credits/archive";
import {
  archive,
  credit,
  listed,
  onPeople,
  overlaps,
  post,
  summed,
} from "./invented-archive";
import { chartMatrix } from "./charts";
import { COMPARES } from "./compare";
import { VIEWS } from "./views";

import {
  chartCount,
  drawnMembers,
  measureNote,
  tooNewMark,
  tooNewText,
  perArticle,
  perArticleText,
  readSlice,
  sliceCount,
  MOST_ARTICLES,
  sliceFilters,
  sliceKey,
  sliceMembers,
} from "./chart-slice";
import { clearedState, toFilters, type FilterState } from "./filters";

const chartOf = (id: string) => {
  const { layout } = VIEWS.find((view) => view.id === id)!;
  if (layout.type !== "chart") throw new Error(`${id} is not a chart`);
  return layout.chart;
};

/*
  A slice lists what its mark counts. These go through every chart the
  builder can make and check, for every mark, that the list is as long as
  the number drawn, and that everything on it belongs there.
*/

/* every configuration the builder can make: what settle leaves as it is */
const configs: ChartConfig[] = COUNTS.flatMap(({ id: count }) =>
  GROUPINGS.flatMap(({ id: by }) =>
    SPLITS.flatMap(({ id: split }) =>
      DRAWS.flatMap((draw) =>
        VALUES.flatMap((values) =>
          ORDERS.flatMap((order) =>
            TOPS.flatMap((top) =>
              COMPARES.map(({ id: compare }) => ({
                count,
                by,
                split,
                draw,
                values,
                order,
                top,
                compare,
              })),
            ),
          ),
        ),
      ),
    ),
  ),
).filter((config) => {
  const settled = settle(config);
  return (Object.keys(config) as (keyof ChartConfig)[]).every(
    (key) => settled[key] === config[key],
  );
});

/* how a chart is drawn does not change what it counts, nor does an order or
   a top the builder does not offer for that grouping: one of each of the rest */
const counting = [
  ...new Map(
    configs.map((config) => [
      JSON.stringify([
        config.count,
        config.by,
        config.split,
        config.values,
        isPeriod(config.by) ? null : config.order,
        config.by === "person" ? config.top : null,
      ]),
      config,
    ]),
  ).values(),
];

const filterings: [string, Filters][] = [
  ["no filters", NO_FILTERS],
  ["images only", { ...NO_FILTERS, roles: ["image"] }],
  ["from January", { ...NO_FILTERS, from: "2026-01-01" }],
  ["two sections", { ...NO_FILTERS, sections: ["News", "Sports"] }],
];

/* the day of the earliest article anywhere that credits each person */
const firstOf = new Map(
  archive
    .flatMap((article) => contributionsOn(article))
    .map((c) => [c.person, easternDate(c.article.publishedAt)] as const)
    .sort(([, a], [, b]) => b.localeCompare(a)),
);

/** whether a unit falls under a key of a dimension, worked out afresh */
function under(
  unit: Unit,
  dimension: Dimension,
  key: string,
  upTo: boolean,
  grain: Period,
) {
  if (dimension === "section") return unit.article.section === key;
  if (dimension === "role") return unit.role === key;
  if (dimension === "person") return unit.person === key;
  if (dimension === "joined")
    return periodOf(firstOf.get(unit.person!)!, grain).key === key;
  if (dimension === "since") throw new Error("a chart is never cut by since");
  const period = periodOf(easternDate(unit.article.publishedAt), dimension).key;
  return upTo ? period <= key : period === key;
}

function check(grouped: Grouped, config: ChartConfig, filters: Filters) {
  const { measure } = grouped;
  const grain = grainOf(config.by);
  const keys = grouped.series.map((s) => s.key);
  const hiddens = [[], ...keys.slice(0, 1).map((key) => [key])];
  const quantity = measure === "words" || measure === "views";
  /* an article whose words count under two people or roles */
  const twice = quantity && [config.by, config.split].some(overlaps);
  const amount = (members: Member[]) => summed(measure, members);

  for (const { key: category } of grouped.categories) {
    for (const series of keys) {
      const slice = { category, series };
      const members = sliceMembers(grouped, slice, []);
      /* what the segment it was opened from says */
      expect(amount(members)).toBe(grouped.values[category]?.[series] ?? 0);
      expect(new Set(members.map((m) => m.id)).size).toBe(members.length);
      expect(readSlice(sliceKey(slice), grouped)).toEqual(slice);

      for (const member of members) {
        expect(member.units.length).toBeGreaterThan(0);
        for (const unit of member.units) {
          expect(under(unit, config.by, category, grouped.running, grain)).toBe(
            true,
          );
          if (config.split !== "none")
            expect(under(unit, config.split, series, false, grain)).toBe(true);
          if (filters.roles.length > 0 && unit.role)
            expect(filters.roles).toContain(unit.role);
        }
        if (measure === "people")
          expect(member.units.every((u) => u.person === member.id)).toBe(true);
        else if (quantity)
          /* an article once, from whichever contributions put it here */
          expect(member.units.every((u) => u.article.id === member.id)).toBe(
            true,
          );
        else expect(member.units).toHaveLength(1);
      }
      if (measure === "newcomers")
        for (const { units } of members) {
          /* nobody credited before, anywhere in the archive */
          const first = units[0]!;
          const earlier = archive.filter(
            (a) => a.publishedAt < first.article.publishedAt,
          );
          expect(
            earlier.some((a) =>
              a.credits.some(
                (c) =>
                  (filters.roles.length === 0 ||
                    filters.roles.includes(c.role)) &&
                  c.contributors.some((p) => p.name === first.person),
              ),
            ),
          ).toBe(false);
        }
    }

    for (const hidden of hiddens) {
      const column = sliceMembers(grouped, { category, series: null }, hidden);
      /* as long as the column's total: the stack of the series the legend
         leaves on, or for people, the distinct people across every series,
         unless the series are when they joined, which nobody is in two of */
      const drawn = keys.filter((key) => !hidden.includes(key));
      const stack = drawn.reduce(
        (sum, s) => sum + (grouped.values[category]?.[s] ?? 0),
        0,
      );
      if (measure === "people" && config.split !== "joined")
        expect(column.length).toBe(grouped.totals[category] ?? 0);
      /* an article in two roles is once in the column, which no stack draws */
      else if (twice && config.split === "role")
        expect(amount(column)).toBeLessThanOrEqual(stack);
      else expect(amount(column)).toBe(stack);
      if (hidden.length === 0)
        expect(amount(column)).toBe(grouped.totals[category] ?? 0);
    }
    expect(readSlice(category, grouped)).toEqual({ category, series: null });
  }

  for (const hidden of hiddens) {
    /* the caption's count: everything the marks drawn list, each once */
    const drawn = drawnMembers(grouped, hidden);
    const listed = new Set(
      grouped.categories.flatMap(({ key: category }) =>
        keys
          .filter((key) => !hidden.includes(key))
          .flatMap((series) =>
            sliceMembers(grouped, { category, series }, []).map((m) => m.id),
          ),
      ),
    );
    expect(new Set(drawn.map((m) => m.id))).toEqual(listed);
    expect(drawn).toHaveLength(listed.size);
    if (measure !== "people" && !twice && !grouped.running)
      expect(amount(drawn)).toBe(
        grouped.categories.reduce(
          (sum, { key: category }) =>
            sum +
            amount(sliceMembers(grouped, { category, series: null }, hidden)),
          0,
        ),
      );
  }
  /* with every series on and nobody cut, the chart draws all it counted */
  if (grouped.categories.length >= grouped.available)
    expect(amount(drawnMembers(grouped, []))).toBe(grouped.total);
}

test("the builder makes charts of every kind, so all of them are checked", () => {
  /* a guard against the list above quietly shrinking to nothing */
  expect(configs.length).toBeGreaterThan(100);
  expect(new Set(configs.map((c) => c.count)).size).toBe(COUNTS.length);
  expect(new Set(configs.map((c) => c.values)).size).toBe(VALUES.length);
  expect(new Set(configs.map((c) => c.draw)).size).toBe(DRAWS.length);
  expect(counting.length).toBeGreaterThan(50);
  /* and the saved views among them */
  for (const view of VIEWS)
    if (view.layout.type === "chart")
      expect(configs).toContainEqual(view.layout.chart);
});

test("Headcount counts each person once a semester, whatever they did", () => {
  const headcount = chartOf("headcount");
  const grouped = groupOf(headcount, archive, NO_FILTERS, archive);
  /* Fall 2025: Ada wrote twice and illustrated once, beside Bo, Cy and Dee */
  const fall = sliceMembers(grouped, { category: "2025-2", series: null }, []);
  expect(fall.map((m) => m.id).sort()).toEqual([
    "Ada Example",
    "Bo Sample",
    "Cy Placeholder",
    "Dee Invented",
  ]);
  expect(grouped.values["2025-2"]?.all).toBe(4);
  expect(fall.find((m) => m.id === "Ada Example")!.units).toHaveLength(3);
});

test("split by when they joined, each person is in one series, at their first contribution", () => {
  const grouped = groupOf(
    { ...chartOf("headcount"), split: "joined", draw: "stacked" },
    archive,
    /* a role filter does not move anyone's intake */
    { ...NO_FILTERS, roles: ["writer"] },
    archive,
  );
  const spring = (series: string) =>
    sliceMembers(grouped, { category: "2026-1", series }, [])
      .map((m) => m.id)
      .sort();
  /* Ada wrote in Spring 2026 and started in Fall 2025; Bo, who also did,
     only drew then */
  expect(spring("2025-2")).toEqual(["Ada Example"]);
  expect(spring("2026-1")).toEqual([
    "Eli Madeup",
    "Fay Fictive",
    "Ivy Imagined",
  ]);
  expect(
    sliceMembers(grouped, { category: "2026-1", series: null }, []),
  ).toHaveLength(4);
});

/* one count at a time, each a test of its own size */
const byCount = filterings.flatMap(([name, filters]) =>
  COUNTS.map(({ id }) => [id, name, filters] as const),
);

test.each(byCount)(
  "every mark of every chart lists exactly what it counts, counting %s, with %s",
  (count, _, filters) => {
    const shown = applyFilters(archive, filters);
    for (const config of counting.filter((c) => c.count === count)) {
      const grouped = groupOf(config, shown, filters, archive);
      expect(grouped.categories.length, JSON.stringify(config)).toBeGreaterThan(
        0,
      );
      check(grouped, config, filters);
    }
  },
);

test("a top ten lists only the people it shows, each with all of theirs", () => {
  const config = configs.find(
    (c) => c.by === "person" && c.top === 10 && c.split === "role",
  )!;
  const grouped = groupOf(config, archive, NO_FILTERS, archive);
  expect(grouped.categories).toHaveLength(10);
  expect(grouped.available).toBeGreaterThan(10);
  /* Ada wrote four and illustrated one */
  const ada = sliceMembers(
    grouped,
    { category: "Ada Example", series: null },
    [],
  );
  expect(ada).toHaveLength(5);
  expect(
    sliceMembers(grouped, { category: "Ada Example", series: "writer" }, []),
  ).toHaveLength(4);
});

test("a person in two series is one of a column's people, with both", () => {
  const grouped = groupOf(
    {
      count: "people",
      by: "semester",
      split: "role",
      draw: "grouped",
      values: "number",
      order: "largest",
      top: 25,
      compare: "none",
    },
    archive,
    NO_FILTERS,
    archive,
  );
  /* Fall 2025: Ada wrote and illustrated */
  const column = sliceMembers(grouped, { category: "2025-2", series: null }, [
    "writer",
  ]);
  const ada = column.find((m) => m.id === "Ada Example")!;
  expect(ada.units.map((u) => u.role).sort()).toEqual([
    "image",
    "writer",
    "writer",
  ]);
  expect(column).toHaveLength(grouped.totals["2025-2"]!);
});

test("a running total's slice is everything up to its period", () => {
  const grouped = groupOf(
    {
      count: "articles",
      by: "semester",
      split: "section",
      draw: "stacked",
      values: "running",
      order: "largest",
      top: 25,
      compare: "none",
    },
    archive,
    NO_FILTERS,
    archive,
  );
  const news = sliceMembers(
    grouped,
    { category: "2026-1", series: "News" },
    [],
  );
  expect(news.map((m) => m.units[0]!.article.id).sort()).toEqual([1, 4, 7]);
});

test("a link to a mark the chart does not have opens nothing", () => {
  const grouped = groupOf(
    {
      count: "articles",
      by: "section",
      split: "none",
      draw: "stacked",
      values: "number",
      order: "natural",
      top: 25,
      compare: "none",
    },
    archive,
    NO_FILTERS,
    archive,
  );
  expect(readSlice("Rabbithole", grouped)).toBeNull();
  expect(readSlice("News~Sports", grouped)).toBeNull();
  expect(readSlice("News", grouped)).toEqual({
    category: "News",
    series: null,
  });
});

const members = (n: number, article = archive[0]!): Member[] =>
  Array.from({ length: n }, (_, id) => ({ id, units: [{ article }] }));

test("a slice's count says what it is of", () => {
  expect(sliceCount("articles", members(12))).toBe("12 articles");
  expect(sliceCount("articles", members(12), 40)).toBe(
    "12 of 40 articles · 30%",
  );
  /* the whole of a share is just its count */
  expect(sliceCount("articles", members(40), 40)).toBe("40 articles");
  expect(sliceCount("newcomers", members(1))).toBe("1 new person");
  expect(
    sliceCount("contributions", [
      { id: 0, units: [{ article: archive[0]!, role: "writer" }] },
      { id: 1, units: [{ article: archive[0]!, role: "image" }] },
      { id: 2, units: [{ article: archive[1]!, role: "writer" }] },
    ]),
  ).toBe("3 contributions on 2 articles");
});

test("the caption counts what is drawn, of all there is", () => {
  const history = chartOf("history");
  const grouped = groupOf(history, archive, NO_FILTERS, archive);
  expect(chartCount(grouped, [])).toBe("10 articles");
  /* four of the ten are News */
  expect(chartCount(grouped, ["News"])).toBe("6 of 10 articles");
  expect(chartCount(grouped, ["News", "Features", "Sports"])).toBe(
    "0 of 10 articles",
  );
});

test("a top ten's caption counts the ten people's contributions", () => {
  const config = configs.find(
    (c) => c.by === "person" && c.top === 10 && c.split === "role",
  )!;
  const grouped = groupOf(config, archive, NO_FILTERS, archive);
  const drawn = grouped.categories.reduce(
    (sum, { key }) => sum + grouped.totals[key]!,
    0,
  );
  /* 13 people made 21 contributions, and the three left out one each */
  expect(grouped.available).toBe(13);
  expect(drawn).toBe(18);
  expect(chartCount(grouped, [])).toBe(
    "Top 10 of 13 people · 18 of 21 contributions",
  );
  /* five of the ten's are images */
  expect(chartCount(grouped, ["image"])).toBe(
    "Top 10 of 13 people · 13 of 21 contributions",
  );
});

test("Headcount's caption counts each person once, which its columns do not", () => {
  const headcount = chartOf("headcount");
  const grouped = groupOf(headcount, archive, NO_FILTERS, archive);
  const columns = Object.values(grouped.totals).reduce((a, b) => a + b, 0);
  expect(chartCount(grouped, [])).toBe("13 different people");
  expect(columns).toBeGreaterThan(13);
});

test.each(COUNTS.map(({ id }) => id))(
  "every mark, as filters, lists on a table exactly what it counts, counting %s",
  (count) => {
    const state = clearedState("all");
    const filters = toFilters(state);
    const shown = applyFilters(archive, filters);
    /* Articles lists an article nobody is credited on, which no count of
     people has */
    const credited = new Set(
      archive.filter((a) => contributionsOn(a).length > 0).map((a) => a.id),
    );
    const ids = (units: Unit[]) =>
      [...new Set(units.map((u) => u.article.id))].sort((a, b) => a - b);
    const wrong: string[] = [];
    let checked = 0;
    for (const config of counting.filter((c) => c.count === count)) {
      const grouped = groupOf(config, shown, filters, archive);
      /* one series is its column, and hiding it leaves nothing to open */
      const keys =
        config.split === "none" ? [] : grouped.series.map((s) => s.key);
      for (const hidden of keys.length > 0 ? [[], keys.slice(0, 1)] : [[]])
        for (const { key: category } of grouped.categories)
          for (const series of [null, ...keys]) {
            const slice = { category, series };
            const members = sliceMembers(grouped, slice, hidden);
            if (members.length === 0) continue;
            const units = members.flatMap((m) => m.units);
            const seeing = sliceFilters(
              grouped,
              config,
              slice,
              members,
              hidden,
              state,
            );
            const same = (a: unknown, b: unknown) =>
              JSON.stringify(a) === JSON.stringify(b);
            let ok: boolean;
            if (grouped.measure === "newcomers")
              /* new people are their first articles, with them named */
              ok =
                same(listed(seeing.articles).articles, ids(units)) &&
                same(
                  onPeople(seeing.people)
                    .map((row) => row.name)
                    .sort(),
                  [...new Set(units.map((u) => u.person!))].sort(),
                );
            else {
              const table = listed(seeing.articles);
              /* words or views not cut by anyone are of articles, as
                 articles are; cut by a person or a role, of their
                 contributions' */
              const ofArticles =
                grouped.measure === "articles" ||
                units.every((u) => u.person === undefined);
              ok =
                same(
                  table.articles.filter((id) => ofArticles || credited.has(id)),
                  ids(units),
                ) &&
                (ofArticles ||
                  (onPeople(seeing.people).reduce(
                    (n, row) => n + row.contributions,
                    0,
                  ) === units.length &&
                    same(
                      table.contributions,
                      units
                        .map((u) => `${u.article.id} ${u.role} ${u.person}`)
                        .sort(),
                    )));
            }
            if (!ok)
              wrong.push(
                `${JSON.stringify(config)} ${sliceKey(slice)} hiding ${hidden.join()}`,
              );
            checked++;
          }
    }
    expect(wrong).toEqual([]);
    expect(checked).toBeGreaterThan(50);
  },
);

test("a period as filters is the part of it the range covers, and a running total all of it so far", () => {
  const config = chartOf("history");
  const state: FilterState = {
    ...clearedState("custom"),
    from: "2025-10-01",
  };
  const grouped = groupOf(
    config,
    applyFilters(archive, toFilters(state)),
    toFilters(state),
    archive,
  );
  const slice = { category: "2025-2", series: null };
  const seeing = sliceFilters(
    grouped,
    config,
    slice,
    sliceMembers(grouped, slice, []),
    [],
    state,
  );
  expect(seeing.articles).toMatchObject({
    preset: "custom",
    from: "2025-10-01",
    to: "2025-12-31",
  });

  const running = groupOf(
    { ...config, values: "running" },
    archive,
    NO_FILTERS,
    archive,
  );
  const spring = { category: "2026-1", series: "News" };
  const through = sliceFilters(
    running,
    config,
    spring,
    sliceMembers(running, spring, []),
    [],
    clearedState("all"),
  );
  expect(through.articles).toMatchObject({
    preset: "custom",
    from: undefined,
    to: "2026-05-31",
    sections: ["News"],
  });
});

/* a contributions chart by section, searched for one title */
function searched(articles: ArchiveArticle[], search: string) {
  const config = { ...chartOf("sections"), count: "contributions" as const };
  const state = { ...clearedState("all"), search };
  const filters = toFilters(state);
  const grouped = groupOf(
    config,
    applyFilters(articles, filters),
    filters,
    articles,
  );
  const slice = { category: "News", series: null };
  const members = sliceMembers(grouped, slice, []);
  return {
    members,
    seeing: sliceFilters(grouped, config, slice, members, [], state),
  };
}

test("a search goes to People as the articles it found, whose own search is of names", () => {
  const articles = [
    post(1, "2026-10-01", "News", [credit("writer", ["Ada Example"])]),
    post(2, "2026-10-02", "News", [credit("writer", ["Ada Example"])]),
  ];
  const { members, seeing } = searched(articles, "headline 1");
  expect(members).toHaveLength(1);
  expect(seeing.articles.search).toBe("headline 1");
  expect(seeing.people).toMatchObject({ search: "", articles: [1] });
  /* Ada wrote both; the search counted one */
  expect(
    onPeople(seeing.people, articles).map((row) => [
      row.name,
      row.contributions,
    ]),
  ).toEqual([["Ada Example", 1]]);
});

test("an article found with nobody credited on it is nobody on People", () => {
  const articles = [
    post(1, "2026-10-01", "News", []),
    post(2, "2026-10-02", "News", [credit("writer", ["Ada Example"])]),
  ];
  const config = chartOf("sections");
  const state = { ...clearedState("all"), search: "headline 1" };
  const filters = toFilters(state);
  const grouped = groupOf(
    config,
    applyFilters(articles, filters),
    filters,
    articles,
  );
  const slice = { category: "News", series: null };
  const seeing = sliceFilters(
    grouped,
    config,
    slice,
    sliceMembers(grouped, slice, []),
    [],
    state,
  );
  expect(onPeople(seeing.people, articles)).toEqual([]);
});

test("too many articles for a link open on the people's whole record, and say so", () => {
  const articles = Array.from({ length: MOST_ARTICLES + 1 }, (_, i) =>
    post(i + 1, "2026-10-01", "News", [credit("writer", ["Ada Example"])]),
  );
  const { seeing } = searched(articles, "headline");
  expect(seeing.broader).toBe("people");
  expect(seeing.people).toMatchObject({
    people: ["Ada Example"],
    articles: [],
  });
  expect(searched(articles.slice(1), "headline").seeing.broader).toBeNull();
});

/* Ada writes and draws article 2: two contributions, one article's words */
test("a person's words are those of the articles they are credited on, each once", () => {
  const grouped = groupOf(
    { ...chartOf("sections"), count: "words", by: "person", top: 0 },
    archive,
    NO_FILTERS,
    archive,
  );
  const ada = sliceMembers(
    grouped,
    { category: "Ada Example", series: null },
    [],
  );

  expect(ada.map((m) => m.id).sort()).toEqual([1, 2, 6, 9]);
  expect(grouped.totals["Ada Example"]).toBe(153 + 206 + 418 + 577);
  expect(sliceCount("words", ada)).toBe("1,354 words on 4 articles");
  expect(measureNote("words", ["person", "none"])).toMatch(/once/);
  expect(measureNote("words", ["section", "none"])).toBe("");
});

/* News is articles 1, 4, 7 and 9: 4 and 9 have no views to read, and 7 was
   read by nobody */
test("views unavailable are left out of a sum and counted beside it, never as zero", () => {
  const grouped = groupOf(
    { ...chartOf("sections"), count: "views" },
    archive,
    NO_FILTERS,
    archive,
  );
  const news = sliceMembers(grouped, { category: "News", series: null }, []);

  expect(news).toHaveLength(4);
  expect(grouped.totals.News).toBe(37);
  expect(sliceCount("views", news)).toBe("37 views on 2 articles");
  /* said once, last, after what it qualifies, and marked on the number */
  expect(tooNewText(news, "views")).toBe("2 articles too new to count yet");
  expect(tooNewMark(news, "views")).toBe("2 articles too new to count yet");
  expect(chartCount(grouped, [])).not.toMatch(/too new/);
  expect(measureNote("views", ["section", "none"])).toMatch(/^Lifetime views/);
});

test("per article is words or views over the articles counted, and nothing else's", () => {
  const views = groupOf(
    { ...chartOf("sections"), count: "views", values: "per-article" },
    archive,
    NO_FILTERS,
    archive,
  );
  const news = sliceMembers(views, { category: "News", series: null }, []);
  /* 37 views over posts 1 and 7, the two with views read */
  expect(perArticle(news, "views")).toBe(19);
  expect(perArticleText(news, "views")).toBe("19 views per article");

  const sections = chartOf("sections");
  expect(allows({ ...sections, count: "articles" }).values["per-article"]).toBe(
    false,
  );
  /* averages stacked would add up to nothing */
  expect(
    allows({
      ...sections,
      count: "words",
      by: "semester",
      split: "section",
      draw: "stacked",
    }).values["per-article"],
  ).toBe(false);
  expect(
    allows({
      ...sections,
      count: "words",
      by: "semester",
      split: "section",
      values: "per-article",
    }).draw.stacked,
  ).toBe(false);
});

/* News is posts 1, 4, 7 and 9: 4 and 9 have no views read */
test("a CSV of views per article says so, with the articles each counted beside it", () => {
  const config: ChartConfig = {
    ...chartOf("sections"),
    count: "views",
    values: "per-article",
  };
  const { header, body } = chartMatrix(
    groupOf(config, archive, NO_FILTERS, archive),
    config,
  );

  expect(header).toEqual([
    "Section",
    "Views per article",
    "Views: articles counted",
    "Views: articles too new to count",
  ]);
  /* 37 views over posts 1 and 7 */
  expect(body.find(([label]) => label === "News")).toEqual(["News", 19, 2, 2]);

  /* a count of words has no articles without words */
  const words = { ...config, count: "words" } as const;
  expect(
    chartMatrix(groupOf(words, archive, NO_FILTERS, archive), words).header,
  ).toEqual(["Section", "Words per article"]);
});

test("views say counting began in January 2023 only where an article is older", () => {
  const counting = { ...chartOf("sections"), count: "views" } as const;
  const older = [
    ...archive,
    post(11, "2022-11-03", "News", [credit("writer", ["Ada Example"])]),
  ];
  const note = (articles: typeof archive) =>
    measureNote(
      "views",
      ["section", "none"],
      drawnMembers(groupOf(counting, articles, NO_FILTERS, articles), []),
    );

  expect(note(archive)).toBe(
    "Lifetime views of the articles published in the range",
  );
  expect(note(older)).toBe(
    "Lifetime views of the articles published in the range, counted since January 2023",
  );
});
