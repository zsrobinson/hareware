export function getTaggedText(content: Element[]) {
  let isBolded = false;
  let isItalicized = false;
  let output = "";
  let unprocessed = new Set<string>();

  function processEl(el: Element | ChildNode) {
    if (el.nodeName === "#text") {
      if (isBolded && isItalicized) output += "<cTypeface:Bold Italic>";
      if (isBolded && !isItalicized) output += "<cTypeface:Bold>";
      if (!isBolded && isItalicized) output += "<cTypeface:Italic>";

      output += encodeTaggedAscii(el.nodeValue || "");

      if (isBolded || isItalicized) output += "<cTypeface:>";
    } else if (el.nodeName === "P") {
      output +=
        "<ParaStyle:><pSpaceAfter:9.000000><pTextAlignment:JustifyLeft>";
      [...el.childNodes].map(processEl);
      output += "\n";
    } else if (el.nodeName === "STRONG") {
      isBolded = true;
      [...el.childNodes].map(processEl);
      isBolded = false;
    } else if (el.nodeName === "EM") {
      isItalicized = true;
      [...el.childNodes].map(processEl);
      isItalicized = false;
    } else if (el.nodeName === "BR") {
      output += "<0x000D>";
    } else {
      unprocessed.add(el.nodeName);
      [...el.childNodes].map(processEl);
    }
  }

  const trimmed = content.filter(
    (el) =>
      !el.innerHTML.includes("Article by:") &&
      !el.innerHTML.includes("Image Credits:"),
  );

  const header = `<ASCII-MAC>
<Version:21.2><FeatureSet:InDesign-Roman><ColorTable:=<Black:COLOR:CMYK:Process:0,0,0,1>>
`;
  const footer =
    " <cLigatures:0><cOTFContAlt:0><0x25C6><cLigatures:><cOTFContAlt:>";

  output += header; // add file header for indesign tagged text
  trimmed.map(processEl); // process and add all the article content
  output = output.slice(0, -1); // remove last newline character
  output += footer; // add diamond symbol at the end

  return { output, unprocessed };
}

// tbh this is from chat
export function encodeTaggedAscii(input: string): string {
  let out = "";

  // Iterate UTF-16 code units so supplementary chars become surrogate pairs (<0xD83D><0xDE00>)
  for (let i = 0; i < input.length; i++) {
    const code = input.charCodeAt(i);

    // Keep plain printable ASCII except tag delimiters
    const isPrintableAscii = code >= 0x20 && code <= 0x7e;
    const isTagDelimiter = code === 0x3c || code === 0x3e; // < or >

    if (isPrintableAscii && !isTagDelimiter) {
      out += input[i];
    } else if (code === 0x0a) {
      out += "\r"; // Mac line ending for tagged text
    } else {
      out += `<0x${code.toString(16).toUpperCase().padStart(4, "0")}>`;
    }
  }

  return out;
}
