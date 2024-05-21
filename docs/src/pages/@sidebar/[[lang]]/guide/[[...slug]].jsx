import { basename, relative } from "node:path";

import { useUrl } from "@lazarv/react-server";

import Menu from "../../../../../public/menu.svg?react";
import { defaultLanguage } from "../../../../const.mjs";

const guides = Array.from(
  Object.entries(
    import.meta.glob("../../../*/guide/**/*.{md,mdx}", { eager: true })
  )
);

export default function Sidebar({ lang }) {
  const { pathname } = useUrl();

  return (
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
                    [guide.frontmatter?.category ?? "Guide"]: [
                      ...(categories[guide.frontmatter?.category ?? "Guide"] ??
                        []),
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
                    i > 0 ? " border-t pt-4 dark:border-gray-800" : ""
                  }`}
                >
                  {category}
                </div>
                {guides
                  .sort(
                    ([, { frontmatter: a }], [, { frontmatter: b }]) =>
                      (a?.order ?? 0) - (b?.order ?? 0)
                  )
                  .map(([mod, { frontmatter }]) => {
                    const href = `${
                      lang !== defaultLanguage ? `/${lang}` : ""
                    }/guide/${
                      frontmatter?.slug ??
                      relative(`../../../${lang}/guide`, mod)
                        .replace(/\.mdx?$/, "")
                        .replace(/[./]page$/, "")
                    }`;
                    const langHref =
                      lang !== defaultLanguage ? href : `/${lang}${href}`;
                    const isActive =
                      pathname === langHref ||
                      (frontmatter?.slug === "" &&
                        pathname === `/${lang}/guide`);
                    return (
                      <a
                        key={mod}
                        href={href}
                        className={`block mb-1 text-sm${
                          isActive
                            ? " text-indigo-500 dark:text-yellow-600 active"
                            : ""
                        }`}
                      >
                        {frontmatter?.title ??
                          basename(mod).replace(/\.mdx?$/, "")}
                      </a>
                    );
                  })}
              </div>
            ))}
        </nav>
      </aside>
      <div id="sidebar-toggle-label">
        <label htmlFor="sidebar-toggle">
          <Menu />
          Menu
        </label>
      </div>
    </>
  );
}
