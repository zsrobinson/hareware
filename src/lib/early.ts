/*
  Requests a page starts before its JavaScript has loaded. A static page's
  island needs a few dozen chunks before it can ask WordPress for anything, and
  the article waited behind them (ADR 0012). So each page carries a small inline
  script, built here at build time, that sends the one request its island will
  make as soon as the HTML arrives; the island then takes that request rather
  than sending its own.

  The script's addresses come from the same builders the islands use, with
  placeholders for what the page's own address supplies, so the two cannot ask
  for different things. ~/lib/early-requests is where the islands take them.
*/

import {
  articleUrl,
  latestUrl,
  NEWSLETTER_COUNT,
  recentUrl,
  viaHareWare,
} from "~/lib/services/wordpress/urls";

/** what a page starts early */
export type Early =
  /** `?article=slug`, or the recent list when there is none */
  | "article-or-recent"
  /** `?article=slug` */
  | "article"
  /** the newsletter's latest articles */
  | "latest"
  /** a gated API the page asks first, by path */
  | { api: string };

const SLUG = "__SLUG__";
const PAGE = "__PAGE__";

/** the inline script for a page, as source text */
export function earlyScript(early: Early): string {
  const article = `const a = q.get("article");
    const slug = a && /^[a-z0-9-]+$/i.test(a) ? a : null;
    if (slug) go(${JSON.stringify(viaHareWare(articleUrl(SLUG)))}.replace(${JSON.stringify(SLUG)}, slug));`;

  const body =
    early === "article-or-recent"
      ? `${article}
    if (!a) go(${JSON.stringify(viaHareWare(recentUrl(PAGE)))}.replace(${JSON.stringify(PAGE)}, String(Math.max(1, Number(q.get("page")) || 1))));`
      : early === "article"
        ? article
        : early === "latest"
          ? `go(${JSON.stringify(viaHareWare(latestUrl(NEWSLETTER_COUNT)))});`
          : `go(${JSON.stringify(early.api)}, { cache: "no-store" });`;

  /* an old browser without `??=`, or anything else going wrong, leaves the
     island to send the request itself, as it would have anyway. A request
     that fails before the island takes it is marked handled, so it does not
     surface as an unhandled rejection; the island still gets the failure */
  return `try {
    const m = (window.__early ??= new Map());
    const go = (url, init) => {
      if (m.has(url)) return;
      const response = fetch(url, init);
      response.catch(() => {});
      m.set(url, { at: Date.now(), response });
    };
    const q = new URLSearchParams(location.search);
    ${body}
  } catch {}`;
}
