import Markdown from "react-markdown";
import ClientMarkdown from "./Client.jsx";

export default function App() {
  return (
    <html lang="en" suppressHydrationWarning>
      <body suppressHydrationWarning>
        <Markdown>{`# Hello Server World\n\nThis is a markdown content from the server.`}</Markdown>
        <ClientMarkdown />
      </body>
    </html>
  );
}
