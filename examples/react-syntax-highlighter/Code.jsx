"use client";

import { Light as SyntaxHighlighter } from "react-syntax-highlighter";
import js from "react-syntax-highlighter/dist/esm/languages/hljs/javascript";
import { dark } from "react-syntax-highlighter/dist/esm/styles/hljs";

SyntaxHighlighter.registerLanguage("javascript", js);

export default function ClientCode() {
  return (
    <SyntaxHighlighter language="javascript" style={dark}>
      {`import { Link } from '@lazarv/react-server/navigation';`}
    </SyntaxHighlighter>
  );
}
