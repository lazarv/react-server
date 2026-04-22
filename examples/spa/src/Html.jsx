import "./index.css";

// Document shell. Renders pure HTML elements + whatever the entry passes as
// `children`. Stays directive-free so it works both as a server component
// (RSC variant) and, when transitively pulled through a "use client" entry,
// as a client component (SSR shortcut variant).
export default function Html({ children }) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        <title>@lazarv/react-server</title>
      </head>
      <body suppressHydrationWarning>{children}</body>
    </html>
  );
}
