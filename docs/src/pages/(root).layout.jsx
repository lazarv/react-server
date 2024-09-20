import "highlight.js/styles/github-dark-dimmed.css";
import "./global.css";

import { cookie, usePathname } from "@lazarv/react-server";
import { Analytics } from "@vercel/analytics/react";
import { SpeedInsights } from "@vercel/speed-insights/react";

import EditPage from "../components/EditPage.jsx";
export default function Layout({
  breadcrumb,
  header,
  sidebar,
  contents,
  navigation,
  footer,
  children,
}) {
  const pathname = usePathname();
  const { dark } = cookie();

  return (
    <html
      lang="en"
      className={dark === "1" ? "dark" : dark === "0" ? "light" : null}
    >
      <head>
        <meta charSet="utf-8" />
        <meta name="view-transition" content="same-origin" />
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <meta name="generator" content="@lazarv/react-server" />

        <title>@lazarv/react-server</title>
        <link rel="icon" type="image/png" href="/favicon.png" />
        <script
          type="application/javascript"
          dangerouslySetInnerHTML={{
            __html:
              `if (document.cookie.includes("dark=1")) document.documentElement.classList.add('dark');\n` +
              `else if (document.cookie.includes("dark=0")) document.documentElement.classList.add('light');`,
          }}
        ></script>

        <meta property="og:locale" content="en" />
        <meta property="og:site_name" content="@lazarv/react-server" />
        <meta property="og:type" content="website" />
        <meta
          property="og:image"
          content="https://react-server.dev/opengraph.jpg"
        />
        <meta property="og:image:width" content="1200" />
        <meta property="og:image:height" content="630" />
        <meta property="og:url" content="https://react-server.dev" />
        <meta property="twitter:card" content="summary_large_image" />
        <meta
          name="description"
          content="The easiest way to build React apps with server-side rendering"
        />
        <meta property="og:title" content="@lazarv/react-server" />
        <meta
          property="og:description"
          content="The easiest way to build React apps with server-side rendering."
        />
        <link
          rel="stylesheet"
          href="https://cdn.jsdelivr.net/npm/@docsearch/css@3"
        />
        <link
          rel="preconnect"
          href="https://OVQLOZDOSH-dsn.algolia.net"
          crossOrigin="anonymous"
        />
      </head>
      <body data-path={pathname}>
        {header}
        <main>
          {sidebar}
          <article>
            {breadcrumb}
            <EditPage pathname={pathname} />
            {children}
            {navigation}
          </article>
          {contents}
        </main>
        {footer}
        <Analytics />
        <SpeedInsights />
      </body>
    </html>
  );
}
