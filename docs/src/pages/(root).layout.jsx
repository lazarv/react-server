import "highlight.js/styles/github-dark-dimmed.css";
import "./global.css";

import { cookie, usePathname } from "@lazarv/react-server";
import { useMatch } from "@lazarv/react-server/router";
import { Analytics } from "@vercel/analytics/react";
import { SpeedInsights } from "@vercel/speed-insights/react";

import EditPage from "../components/EditPage.jsx";
import { useLanguage, m } from "../i18n.mjs";
import { defaultLanguage, languages } from "../const.mjs";
import { categories } from "../pages.mjs";

const lowerCaseCategories = categories.map((category) =>
  category.trim().toLowerCase()
);

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
  const lang = useLanguage();
  const { category } = useMatch("/[[lang]]/[[category=category]]/[[...slug]]", {
    matchers: {
      category: (value) =>
        lowerCaseCategories.includes(value.trim().toLowerCase()),
    },
  });
  const canonical = pathname.replace(
    new RegExp(`^/(${defaultLanguage}|${lang})`),
    ""
  );

  return (
    <html
      lang={lang}
      className={dark === "1" ? "dark" : dark === "0" ? "light" : null}
      suppressHydrationWarning
    >
      <head>
        <meta charSet="utf-8" />
        <meta name="view-transition" content="same-origin" />
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <meta name="generator" content="@lazarv/react-server" />

        <title>
          {`@lazarv/react-server ${category && pathname !== "/" && pathname !== `/${lang}` ? ` | ${m[`category_${category}`]()}` : ""}`}
        </title>
        <link rel="icon" type="image/png" href="/favicon.png" />
        <script
          type="application/javascript"
          dangerouslySetInnerHTML={{
            __html:
              `if (document.cookie.includes("dark=1")) document.documentElement.classList.add('dark');\n` +
              `else if (document.cookie.includes("dark=0")) document.documentElement.classList.add('light');`,
          }}
        ></script>

        <meta httpEquiv="content-language" content={lang} />
        <meta property="og:locale" content={lang} />
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

        {languages.map((hrefLang) => (
          <link
            key={hrefLang}
            rel="alternate"
            hrefLang={hrefLang}
            href={`https://react-server.dev${hrefLang === defaultLanguage ? "" : `/${hrefLang}`}${canonical}`}
          />
        ))}
        <link
          rel="alternate"
          hrefLang="x-default"
          href={`https://react-server.dev${canonical}`}
        />
        <link rel="canonical" href={`https://react-server.dev${canonical}`} />
      </head>
      <body data-path={pathname} suppressHydrationWarning>
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
