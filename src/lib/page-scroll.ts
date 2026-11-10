/*
  Which element scrolls the page. On a laptop it is the layout's <main>, so the
  sidebar and a side panel stay put beside it; on a phone it is the document,
  so the browser can fold its address bar away and a tap on the status bar
  goes to the top. The layout's CSS decides; this reads what it decided.
*/

/** the page's scroller, and where its visible area starts on the screen */
export function pageScroller(): { element: Element; top: number } {
  const main = document.getElementById("content");
  if (main && getComputedStyle(main).overflowY !== "visible")
    return { element: main, top: main.getBoundingClientRect().top };
  /* the phone's bar sticks to the top of the document, over what scrolls */
  const bar = document.getElementById("top-bar");
  return {
    element: document.scrollingElement ?? document.documentElement,
    top: bar ? bar.getBoundingClientRect().bottom : 0,
  };
}

/**
 * Keeps what `find` gives at the same height on the screen while the page
 * around it changes shape (a side panel opening, the sidebar folding), for
 * as long as that takes. Looked for afresh each frame, since a row can be
 * redrawn as the table narrows.
 */
export function holdInPlace(find: () => Element | null, ms = 400) {
  const start = find()?.getBoundingClientRect().top;
  if (start === undefined) return;
  const until = performance.now() + ms;
  const step = () => {
    const now = find()?.getBoundingClientRect().top;
    if (now === undefined) return;
    if (Math.abs(now - start) >= 1)
      pageScroller().element.scrollTop += now - start;
    if (performance.now() < until) requestAnimationFrame(step);
  };
  requestAnimationFrame(step);
}
