import "highlight.js/styles/github-dark-dimmed.css";
import "./global.css";

import { basename } from "node:path";

import { useUrl } from "@lazarv/react-server";
import { Route } from "@lazarv/react-server/router";

import { defaultLanguage } from "../const.mjs";

const guides = Array.from(
  Object.entries(import.meta.glob("./*/guide/*.{md,mdx}", { eager: true }))
);

export default function Layout({ children }) {
  const { pathname } = useUrl();

  return (
    <html lang="en">
      <head>
        <meta charSet="utf-8" />
        <meta name="view-transition" content="same-origin" />
        <title>@lazarv/react-server</title>
      </head>
      <body>
        <Route
          path="/[[lang]]"
          render={({ lang }) => (
            <header>
              <nav>
                <a href={`/${lang}`}>
                  <h4>@lazarv</h4>
                  <h3>react-server</h3>
                </a>
                <a href={`/${lang}/guide`}>Guide</a>
                <a href={`/${lang}/team`}>Team</a>
                <a href={`/api`}>API</a>
              </nav>
            </header>
          )}
        />
        <main>
          <Route
            path="/[[lang]]/guide"
            render={({ lang }) => (
              <>
                <input type="checkbox" id="sidebar-toggle" />
                <aside id="sidebar">
                  <nav>
                    {Array.from(
                      Object.entries(
                        guides
                          .filter(([mod]) => mod.includes(`${lang}/guide/`))
                          .reduce(
                            (categories, [mod, guide]) => ({
                              ...categories,
                              [guide.frontmatter.category ?? "Guide"]: [
                                ...(categories[
                                  guide.frontmatter.category ?? "Guide"
                                ] ?? []),
                                [mod, guide],
                              ],
                            }),
                            {}
                          )
                      )
                    )
                      .sort(([a], [b]) =>
                        a === "Guide"
                          ? -1
                          : 1 - b === "Guide"
                          ? -1
                          : 1 || a.localeCompare(b)
                      )
                      .map(([category, guides], i) => (
                        <div key={category} className="mb-4">
                          <div
                            className={`text-md font-semibold mb-2${
                              i > 0 ? " border-t pt-4" : ""
                            }`}
                          >
                            {category}
                          </div>
                          {guides
                            .sort(
                              (
                                [, { frontmatter: a }],
                                [, { frontmatter: b }]
                              ) => a?.order ?? 0 - b?.order ?? 0
                            )
                            .map(([mod, { frontmatter }]) => (
                              <a
                                key={mod}
                                href={`${
                                  lang !== defaultLanguage ? `/${lang}` : ""
                                }/guide/${
                                  frontmatter?.slug ??
                                  basename(mod).replace(/\.md$/, "")
                                }`}
                                className={`block mb-1 text-sm${
                                  pathname ===
                                    `/${lang}/guide/${
                                      frontmatter?.slug ??
                                      basename(mod).replace(/\.md$/, "")
                                    }` ||
                                  (frontmatter?.slug === "" &&
                                    pathname === `/${lang}/guide`)
                                    ? " text-indigo-500 active"
                                    : ""
                                }`}
                              >
                                {frontmatter?.title ??
                                  basename(mod).replace(/\.md$/, "")}
                              </a>
                            ))}
                        </div>
                      ))}
                  </nav>
                </aside>
                <div id="sidebar-toggle-label">
                  <label htmlFor="sidebar-toggle">
                    <img src="/menu.svg" alt="Menu" />
                    Menu
                  </label>
                </div>
              </>
            )}
          />
          <article data-path={pathname}>{children}</article>
        </main>
        <footer>
          Released under the MIT License.
          <br />
          Copyright © 2023 Viktor Lázár & Contributors
        </footer>
      </body>
    </html>
  );
}
