import { relative } from "node:path";

import { defaultLanguage } from "./const.mjs";

export const pages = Array.from(
  Object.entries(
    import.meta.glob("./pages/*/\\(pages\\)/**/*.{md,mdx}", { eager: true })
  )
);

export const categories = [
  "Guide",
  "Integrations",
  "Framework",
  "Router",
  "Deploy",
  "Tutorials",
  "Team",
];

export function getPages(pathname, lang) {
  return Array.from(
    Object.entries(
      pages
        .filter(
          ([mod, page]) =>
            page.frontmatter && !mod.includes(`${lang}/tutorials/`)
        )
        .reduce(
          (categories, [mod, page]) => ({
            ...categories,
            [page.frontmatter.category ?? "Guide"]: [
              ...(categories[page.frontmatter.category ?? "Guide"] ?? []),
              [mod, page],
            ],
          }),
          {}
        )
    )
  )
    .sort(([a], [b]) => categories.indexOf(a) - categories.indexOf(b))
    .map(([category, pages]) => ({
      category,
      pages: pages
        .sort(
          ([, { frontmatter: a }], [, { frontmatter: b }]) =>
            (a?.order ?? 0) - (b?.order ?? 0)
        )
        .map(([mod, { frontmatter }]) => {
          const href = `${lang !== defaultLanguage ? `/${lang}` : ""}/${
            frontmatter?.slug ??
            relative(`./pages/${lang}`, mod)
              .replace(/\(pages\)\//, "")
              .replace(/\.mdx?$/, "")
              .replace(/[./]page$/, "")
          }`;
          const langHref = lang !== defaultLanguage ? href : `/${lang}${href}`;
          const isActive =
            pathname === langHref ||
            (frontmatter?.slug === "" && pathname === `/${lang}/guide`);
          return {
            href,
            langHref,
            isActive,
            frontmatter,
            category,
          };
        }),
    }));
}
