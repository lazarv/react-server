import hljs from "react-server-highlight.js/lib/core";
import diff from "react-server-highlight.js/lib/languages/diff";
import javascript from "react-server-highlight.js/lib/languages/javascript";
import json from "react-server-highlight.js/lib/languages/json";
import xml from "react-server-highlight.js/lib/languages/xml";

hljs.registerLanguage("diff", diff);
hljs.registerLanguage("javascript", javascript);
hljs.registerLanguage("json", json);
hljs.registerLanguage("xml", xml);

hljs.registerLanguage("xml-diff", (hljs) => {
  const xmlDef = xml(hljs);
  const diffDef = diff(hljs);

  const diffModes = diffDef.contains
    .filter((m) => ["addition", "deletion", "comment"].includes(m.className))
    .map((m) => ({ ...m, subLanguage: "xml" }));

  const metaMode = diffDef.contains.find((m) => m.className === "meta");
  const xmlTagMode = xmlDef.contains.find((m) => m.className === "tag");
  const xmlOtherModes = xmlDef.contains.filter((m) => m.className !== "tag");

  const mergedXmlTagMode = {
    ...xmlTagMode,
    contains: [...diffModes, ...xmlTagMode.contains],
  };

  const contextLine = {
    begin: "^(?![+\\-@]).+",
    end: "$",
    subLanguage: "xml",
  };

  return {
    name: "xml-diff",
    aliases: ["xml+diff"],
    illegal: xmlDef.illegal,
    keywords: xmlDef.keywords,
    contains: [
      ...diffModes,
      metaMode,
      mergedXmlTagMode,
      ...xmlOtherModes,
      contextLine,
    ],
  };
});

function highlightXmlDiff(code) {
  const lines = code.split("\n");
  const out = [];
  let i = 0;

  while (i < lines.length) {
    const line = lines[i];

    if (/^@@/.test(line)) {
      out.push(`<span class="hljs-meta">${hljs.escapeHTML(line)}</span>`);
      i++;
      continue;
    }

    if (/^[+-]?[ \t]*<[^>]*$/.test(line)) {
      const chunkLines = [];
      let j = i;
      do {
        chunkLines.push(lines[j]);
        j++;
      } while (j < lines.length && !/>/.test(lines[j - 1]));

      const markers = chunkLines.map((l) => {
        const m = l[0];
        return m === "+" || m === "-" ? m : null;
      });

      const innerLines = chunkLines.map((l) =>
        l[0] === "+" || l[0] === "-" ? l.slice(1) : l
      );
      const fullTag = innerLines.join("\n");

      const highlighted = hljs
        .highlight(fullTag, {
          language: "xml",
          ignoreIllegals: true,
        })
        .value.replace(/\n/g, "__LINE_BREAK__");

      const htmlLines = highlighted.split("__LINE_BREAK__");

      htmlLines.forEach((htmlLine, k) => {
        const mark = markers[k];
        if (mark === "+" || mark === "-") {
          out.push(
            `<span class="hljs-${mark === "+" ? "addition" : "deletion"}">` +
              mark +
              htmlLine +
              `</span>`
          );
        } else {
          out.push(htmlLine);
        }
      });

      i = j;
      continue;
    }

    if (/^[+-]/.test(line)) {
      const marker = line[0];
      const inner = line.slice(1);
      const hl = hljs.highlight(inner, {
        language: "xml",
        ignoreIllegals: true,
      }).value;
      out.push(
        `<span class="hljs-${marker === "+" ? "addition" : "deletion"}">` +
          marker +
          hl +
          `</span>`
      );
      i++;
      continue;
    }

    out.push(
      hljs.highlight(line, { language: "xml", ignoreIllegals: true }).value
    );
    i++;
  }

  return out.join("\n");
}

export { hljs, highlightXmlDiff };
