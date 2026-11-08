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
