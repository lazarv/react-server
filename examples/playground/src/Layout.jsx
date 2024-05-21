export default function Layout({ children }) {
  return (
    <html lang="en">
      <head>
        <meta charSet="utf-8" />
        <title>React Server DOM</title>
      </head>
      <body>{children}</body>
    </html>
  );
}
