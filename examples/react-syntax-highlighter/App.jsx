import ClientCode from "./Code.jsx";

import { Light as SyntaxHighlighter } from "react-syntax-highlighter";
import js from "react-syntax-highlighter/dist/esm/languages/hljs/javascript";
import { vs } from "react-syntax-highlighter/dist/esm/styles/hljs";

SyntaxHighlighter.registerLanguage("javascript", js);

function Code() {
  return (
    <SyntaxHighlighter language="javascript" style={vs}>
      {`import { createServer } from 'react-server';`}
    </SyntaxHighlighter>
  );
}

export default function App() {
  return (
    <html lang="en" suppressHydrationWarning>
      <body suppressHydrationWarning>
        <h1>react-syntax-highlighter</h1>
        <Code />
        <ClientCode />
      </body>
    </html>
  );
}
