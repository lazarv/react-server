"use client";

import { MarkdownHooks as Markdown } from "react-markdown";

export default function ClientMarkdown() {
  return (
    <Markdown>{`# Hello Client World\n\nThis is a markdown content from the client.`}</Markdown>
  );
}
