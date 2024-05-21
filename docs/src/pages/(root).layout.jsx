import "highlight.js/styles/github-dark-dimmed.css";
import "./global.css";

import { cookie, useUrl } from "@lazarv/react-server";

export default function Layout({ header, sidebar, navigation, children }) {
  const { pathname } = useUrl();
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
        <title>@lazarv/react-server</title>
        <script
          type="application/javascript"
          dangerouslySetInnerHTML={{
            __html:
              `if (document.cookie.includes("dark=1")) document.documentElement.classList.add('dark');\n` +
              `else if (document.cookie.includes("dark=0")) document.documentElement.classList.add('light');`,
          }}
        ></script>
      </head>
      <body>
        {header}
        <main>
          {sidebar}
          <article data-path={pathname}>
            {children}
            {navigation}
          </article>
        </main>
        <footer>
          Released under the MIT License.
          <br />
          Copyright © 2023-{new Date().getFullYear()} Viktor Lázár &
          Contributors
        </footer>
      </body>
    </html>
  );
}
