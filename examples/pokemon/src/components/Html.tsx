export default function Html({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        <meta charSet="utf-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <title>Pokémon Catalog</title>
      </head>
      <body suppressHydrationWarning>{children}</body>
    </html>
  );
}
