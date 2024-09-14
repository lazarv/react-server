import { basename, relative } from "node:path";

import { usePathname } from "@lazarv/react-server";

import Sidebar from "../../../components/Sidebar.jsx";
import { defaultLanguage } from "../../../const.mjs";
import { categories } from "../../../pages.mjs";

const pages = Array.from(
  Object.entries(
    import.meta.glob("../../../**/\\(pages\\)/**/*.{md,mdx}", { eager: true })
  )
);

export default function PageSidebar({ lang }) {
  const pathname = usePathname();

  return (
    <Sidebar id="sidebar" menu="Menu">
      {Array.from(
        Object.entries(
          pages.reduce(
            (categories, [mod, page]) => ({
              ...categories,
              [page.frontmatter?.category ?? "Guide"]: [
                ...(categories[page.frontmatter?.category ?? "Guide"] ?? []),
                [mod, page],
              ],
            }),
            {}
          )
        )
      )
        .sort(([a], [b]) => categories.indexOf(a) - categories.indexOf(b))
        .map(([category, pages], i) => (
          <div key={category} className="mb-4">
            <div
              className={`text-md font-semibold mb-2${i > 0 ? " border-t pt-4 dark:border-gray-800" : ""}`}
            >
              {!pages.some(
                ([, { frontmatter }]) =>
                  frontmatter?.slug === category.toLowerCase()
              ) ? (
                <a
                  href={`/${lang === defaultLanguage ? "" : `${lang}/`}${category.toLowerCase()}`}
                  className={`mb-2${pathname.includes(`/${lang}/${category.toLowerCase()}`) ? " text-indigo-500 dark:text-yellow-600" : ""}`}
                >
                  {category}
                </a>
              ) : (
                category
              )}
            </div>
            {pages
              .sort(
                ([, { frontmatter: a }], [, { frontmatter: b }]) =>
                  (a?.order ?? 0) - (b?.order ?? 0)
              )
              .map(([mod, { frontmatter }]) => {
                const href = `${lang !== defaultLanguage ? `/${lang}` : ""}/${
                  frontmatter?.slug ??
                  relative(`../../${lang}`, mod)
                    .replace(/\(pages\)\//, "")
                    .replace(/\.mdx?$/, "")
                    .replace(/[./]page$/, "")
                }`;
                const langHref =
                  lang !== defaultLanguage ? href : `/${lang}${href}`;
                const isActive =
                  pathname === langHref ||
                  (frontmatter?.slug === "" && pathname === `/${lang}/guide`);
                return (
                  <a
                    key={mod}
                    href={href}
                    className={`block mb-1 text-sm${isActive ? " text-indigo-500 dark:text-yellow-600 active" : ""}`}
                  >
                    {frontmatter?.title ?? basename(mod).replace(/\.mdx?$/, "")}
                  </a>
                );
              })}
          </div>
        ))}
    </Sidebar>
  );
}
