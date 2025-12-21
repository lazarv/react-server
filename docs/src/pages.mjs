import { join, relative } from "node:path";

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
    .toSorted(([a], [b]) => categories.indexOf(a) - categories.indexOf(b))
    .map(([category, pages]) => ({
      category,
      pages: pages
        .toSorted(
          ([, { frontmatter: a }], [, { frontmatter: b }]) =>
            (a?.order ?? 0) - (b?.order ?? 0)
        )
        .reduce((availablePages, [src, { frontmatter, default: page }]) => {
          const path = relative(`./pages/${lang}`, src);
          const href = join(
            lang !== defaultLanguage ? `/${lang}` : "/",
            frontmatter?.slug ??
              path
                .replace(/\(pages\)\//, "")
                .replace(/\.mdx?$/, "")
                .replace(/[./]page$/, "")
          );
          const langHref =
            lang !== defaultLanguage ? href : join(`/${lang}`, href);
          const isActive =
            pathname === langHref ||
            (frontmatter?.slug === "" && pathname === `/${lang}/guide`);
          const data = {
            href,
            langHref,
            isActive,
            frontmatter,
            category,
            src,
            page,
          };

          if (
            !path.startsWith("../") ||
            !pages.find(([src, { frontmatter }]) => {
              const path = relative(`./pages/${lang}`, src);
              const href = join(
                lang !== defaultLanguage ? `/${lang}` : "/",
                frontmatter?.slug ??
                  path
                    .replace(/\(pages\)\//, "")
                    .replace(/\.mdx?$/, "")
                    .replace(/[./]page$/, "")
              );
              const otherLangHref =
                lang !== defaultLanguage ? href : join(`/${lang}`, href);
              return (
                otherLangHref.startsWith(`/${lang}`) &&
                langHref.split("/").slice(2).join("/") ===
                  otherLangHref.split("/").slice(2).join("/")
              );
            })
          ) {
            data.langHref = data.langHref.replace(/^\/en/, `/${lang}`);
            if (pathname === data.langHref) {
              data.isActive = true;
            }
            availablePages.push(data);
          }
          return availablePages;
        }, []),
    }));
}

export function hasCategory(category) {
  return categories?.find((c) => c.toLowerCase() === category?.toLowerCase());
}
