# 14. Views are declarations, and each table is a page

**Status:** Accepted — 2026-11-09. Amends ADR 0012: the Charts page is gone,
and `/charts` is a static page that forwards. Amends ADR 0011: the open panel's
address is `?open=`, and every link between archive pages carries its filters.

## Context

The archive had five pages: Charts, People, Articles, Problems and Settings.
Charts held five chart views over two tables, Articles and People held one
table each, and nothing joined them. A bar on a chart could list what it
counted beside the chart, but a name in that list opened People on its own last
three months, whatever the chart was cut to, so the panel's count could
disagree with the number clicked. A table could not become a chart, a chart's
articles could not be sorted or downloaded, and adding a view meant reading
the code to find where five lists of them were kept.

The board asked for something closer to a database with views, or a pivot
table with charts: a few good questions already posed, which anyone can turn
into another and share.

## Decision

**Each table is a page, and its views are its tabs.** Articles and People each
have a row of views over the filters: Articles has All, Sections, Section
share and History; People has Everyone, Contributors, Top this semester, New
this semester, Newcomers, Headcount and Retention. A chart is on the
page of the table it counts. Problems and Settings are pages as before, without
views. There is no Contributions page: a contribution is what People's views
count, and what an article's credits are made of.

**A view is a declaration**, plain data in `src/components/archive/views.ts`:
its label and the question it answers, the table it counts, the Time filter
and any other filters it opens on, and its layout. A layout is a table (which
columns, in what order, the sort it opens on, and on People the Show and
whether it lists only the new), a chart (`ChartConfig`, and the series its
legend opens with off) or a pivot (`PivotConfig`: what it counts, its rows
and columns, and whether a cell is a number or a share). A page's views are
the declarations for its table, in order, and the first is a table, which
the page opens on.

**A pivot is the chart's grouping laid out whole.** Its rows and columns are
the same cuts a chart's axis and split are, and every cell and total is a
list of what it counts, as a chart's marks are: a total is a cell with its
row or column left open, so it opens what it adds up, and each of a share's
wholes reads as its count. It scrolls in its own box, is one tab stop with
arrows between its numbers, and downloads or copies as the table it shows.

**Compare is a setting of a chart or a pivot, not a second range in the
filters.** It sets each category beside its count over the period before or
a year before, as paired bars or a pair of columns with their difference,
and each of the pair opens on its own dates. It is offered only where the
pair reads true: on categories (across time the axis is the comparison
already), with nothing split (a stack of two ranges is a total of neither),
and in numbers or a pivot's shares of each range's own total. An earlier
range with nothing in it is said and left undrawn, never drawn as zeros.

**Every view is something the builder can make.** Customize edits whichever
view is on screen, including turning a table into a chart and back; any change
makes it Custom, kept in the address, and Reset goes back to the view it was
made from. A test builds every default view from nothing through the builder's
own steps and gets its declaration back, so no default can drift into one
nobody could reproduce.

**Copy as view writes what is on screen as a declaration**, formatted as
`views.ts` is, so adding a default is a paste and a pull request. It takes in
the legend, People's Show and the columns the Columns menu took out. What a
view cannot hold, a fixed range of dates, a search, or articles a mark chose,
is left out and said in the copy.

**No view is stored anywhere else**: not in the Sheet (ADR 0011: it holds only
what WordPress lacks), not in D1 (the invocation log alone), and not in the
browser. A view of one's own is its link.

**What a view opens on is where it starts.** The Time range, the other filters,
a table's sort, People's Show and a chart's legend start from the view, however
it is reached: its tab, its link, a reload or Clear. Changing any of them
leaves the view as it is; choosing another view keeps whatever was changed,
until Clear. A link names each only where it is not the view's own, and one
cleared where the view has some as empty (`sections=`). A search the next view
would read another way (names on People's table, what articles print
elsewhere) is cleared, and the page says so.

**Selections become filters, and filters travel.** What a chart's mark counts
can be opened on either table as ordinary filters: a period is the part of it
the range covers, and a section, role or person is that filter. A pivot's
cells and totals open the same way. Where newness, an intake or a search
picked what it counts, which People cannot read (its search is of
names), the mark's articles go by post id (`?articles=`), an exact filter with
a chip of its own, beside the new people's or the intake's names. Past 250 ids the link names
the people instead, and the list says it opens on their whole record. Every
link between archive pages carries the filters on screen and names the range
as the page counted it, since each page opens on its own and rounds its own; a
search goes only where it looks at the same thing.

**An open panel is `?open=`, apart from the `people` filter.** `?people=Ada`
counts Ada alone; `?open=Ada` opens her panel and counts everyone. Links from
before, `?person=` and `?article=`, still open the row.

**`/charts` forwards.** Links to it are in Discord and in bookmarks, and where
one goes depends on its `view`, which a `_redirects` rule cannot read. It is a
static page whose script sends each to its view's new page with the rest of the
query, so it costs the Worker nothing (ADR 0012).

## Considered

- **One workspace, choosing whether rows are articles, people or
  contributions, with a chart above them.** It is what a BI tool does, and the
  wrong thing for a board that opens this a few times a semester and needs a
  question already posed. It would also have put pen-name editing inside a
  generic grid, and has no room on a phone.
- **Saved views in the Sheet or in the browser.** The Sheet holds only what
  WordPress lacks, and a view kept in one browser is invisible to everyone
  else. A link is already a view, and a default is a declaration in review.
- **A header click making a table Custom**, as any builder change does. Sorting
  is the most common thing done to a table, and a tab that turned into Custom
  on every click would say nothing. The sort is where the view starts, as the
  range is.
- **Comparing any two ranges, chosen in the filters.** It answers more, and
  every view would need a second Time filter that most of them would make
  misleading. The period before and a year before are the two the board asks
  ("are we down this semester"), and as a view's setting the builder can
  refuse the combinations that would not read true.
- **The period before as the previous semester.** Semesters here are five
  months and seven, so a whole one before is not as long; a year before is
  the same semester, and the period before is as many days.

## Consequences

- A new default view is a declaration added to `views.ts` and nothing else:
  its tab, its link and its place in the builder follow from it.
- A link to an archive page is longer, since it names its filters. Real names
  sit in the address (`?people=`, `?open=`); those links are for the board,
  and stay inside it (ADR 0011).
- Articles lists articles nobody is credited on, so a chart of contributions
  opened on Articles can list an article the chart never counted. People has
  exactly what it counted.
- A pivot of person by month can be thousands of cells. It is drawn whole,
  in the browser, and a top few keeps people's rows or columns short.
