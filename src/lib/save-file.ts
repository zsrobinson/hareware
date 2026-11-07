/**
 * Saves a file under the given name. A link to the blob is clicked, and the
 * blob's address is kept alive well past the click: revoking it at once, as
 * the downloadjs package did, lets Chromium start the download without its
 * name, so every file arrived called "download".
 */
export function saveFile(contents: Blob | string, name: string, type: string) {
  const blob =
    contents instanceof Blob ? contents : new Blob([contents], { type });
  const href = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = href;
  link.download = name;
  link.style.display = "none";
  document.body.appendChild(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(href), 60_000);
}
