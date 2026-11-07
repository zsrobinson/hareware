/*
  The weekly club email, as the HTML the secretary pastes into Gmail. It is
  built as one string so the preview and the copy are the same thing: Gmail
  keeps inline styles and old tags like <font>, and drops the rest.
*/

export type NewsletterArticle = {
  /** html, already scrubbed when the article was read */
  title: string;
  link: string;
  image?: string;
  author?: string;
  imageCredits?: string;
};

const LOGO =
  "https://i0.wp.com/theumdhare.com/wp-content/uploads/2026/02/combination-mark.png?h=90";

/** what someone typed, safe to place in html */
export function escapeHtml(text: string) {
  return text
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

/** the note's paragraphs, split on blank lines as people type them */
const paragraphs = (note: string) =>
  note
    .split(/\n\s*\n/)
    .map((para) => para.trim())
    .filter(Boolean)
    .map((para) => `<p>${escapeHtml(para).replaceAll("\n", "<br />")}</p>`)
    .join("\n");

export function newsletterHtml({
  meeting,
  note,
  articles,
}: {
  /** when and where, as it should read after "will be" */
  meeting: string;
  note: string;
  articles: NewsletterArticle[];
}) {
  const rows = articles
    .map((post) => {
      /* a credit nobody printed is left out, not printed as "Image by" */
      const credits = [
        post.author && `Article by ${escapeHtml(post.author)}`,
        post.imageCredits && `Image by ${escapeHtml(post.imageCredits)}`,
      ]
        .filter(Boolean)
        .map((line) => `<br />${line}`)
        .join("");
      return `<tr>
  <td style="vertical-align: top; padding: 0 0 12px 0;">${
    post.image
      ? `<img src="${escapeHtml(post.image)}" style="width: 150px" />`
      : ""
  }</td>
  <td style="vertical-align: top; padding: 0 0 12px 12px;">
    <strong><a href="${escapeHtml(post.link)}">${post.title}</a></strong>${credits}
  </td>
</tr>`;
    })
    .join("\n");

  return `<div style="background-color: #5b2218; padding: 8px 12px; line-height: 1.15; text-align: center;">
  <img src="${LOGO}" style="height: 30px;" />
</div>
<p>Hey everyone,</p>
<div style="background-color: rgb(244, 204, 204); padding: 8px 12px; line-height: 1.15;">
  <b><font size="4">Our next general body meeting will be ${
    meeting.trim() ? escapeHtml(meeting.trim()) : "[when and where]"
  }.</font></b>
</div>
${paragraphs(note) || "<p>[Your note]</p>"}
<br />
<hr />
<b><font size="4">Latest articles</font></b>
<br />
<br />
<table>
${rows}
</table>`;
}
