import {
  index,
  about,
  user,
  dashboard,
  counter,
  clock,
  todos,
  product,
  productSkuUppercase,
  docs,
  docsSlugNested,
  panels,
} from "@lazarv/react-server/routes";

export default index.createLayout(({ children }) => {
  return (
    <html lang="en">
      <head>
        <meta charSet="utf-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <title>Typed File Router</title>
        <style>{`
          body { font-family: system-ui, sans-serif; margin: 0; padding: 20px; }
          nav { display: flex; gap: 16px; margin-bottom: 20px; padding-bottom: 10px; border-bottom: 1px solid #eee; }
          nav a { text-decoration: none; color: #0066cc; }
          nav a:hover { text-decoration: underline; }
        `}</style>
      </head>
      <body>
        <nav>
          <index.Link>Home</index.Link>
          <about.Link>About</about.Link>
          <user.Link params={{ id: "42" }}>User 42</user.Link>
          <dashboard.Link>Dashboard</dashboard.Link>
          <panels.Link>Panels</panels.Link>
          <counter.Link>Counter</counter.Link>
          <clock.Link>Clock</clock.Link>
          <todos.Link>Todos</todos.Link>
          <productSkuUppercase.Link params={{ sku: "ABC-123" }}>
            Product ABC-123 (matcher)
          </productSkuUppercase.Link>
          <product.Link params={{ sku: "abc-123" }}>
            Product abc-123 (fallback)
          </product.Link>
          <docsSlugNested.Link
            params={{ slug: ["getting-started", "install"] }}
          >
            Docs nested
          </docsSlugNested.Link>
          <docs.Link params={{ slug: ["intro"] }}>Docs flat</docs.Link>
        </nav>
        {children}
      </body>
    </html>
  );
});
