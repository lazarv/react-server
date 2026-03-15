import { index, about, user, dashboard } from "@lazarv/react-server/routes";

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
        </nav>
        {children}
      </body>
    </html>
  );
});
