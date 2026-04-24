import { join, relative } from "node:path";

import { defaultLanguage, languages } from "./const.mjs";
import { apiReferenceIndex } from "./lib/api-reference.mjs";

const frontmatterLoaders = import.meta.glob(
  "./pages/*/\\(pages\\)/**/*.{md,mdx}",
  { import: "frontmatter" }
);
const loaders = import.meta.glob("./pages/*/\\(pages\\)/**/*.{md,mdx}");
const indexPages = import.meta.glob("./pages/*/*.\\(index\\).{md,mdx}");

// Synthetic entries for the dynamic `/api/:slug` pages. They don't exist
// on disk — the docs render them from `@lazarv/react-server`'s `.d.ts`
// definitions via `./lib/api-reference.mjs` — but the sidebar,
// breadcrumbs, and SSG path enumerator all consume this `pages` array
// as their source of truth, so we add entries here with a shape that
// mirrors what an equivalent MDX file would produce.
const apiIndex = apiReferenceIndex();
const apiSyntheticPages = languages.flatMap((lang) =>
  apiIndex.map((p) => [
    `./pages/${lang}/(pages)/api/${p.slug}.mdx`,
    {
      frontmatter: {
        title: p.title,
        category: p.category,
        order: p.order,
      },
    },
  ])
);

export const pages = [
  ...(await Promise.all(
    Object.entries(frontmatterLoaders).map(async ([key, load]) => [
      key,
      { frontmatter: await load() },
    ])
  )),
  ...apiSyntheticPages,
];

export const categories = [
  "Guide",
  "Integrations",
  "Features",
  "Router",
  "Deploy",
  "Tutorials",
  "Advanced",
  "API",
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
        .reduce((availablePages, [src, { frontmatter }]) => {
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
            page: async () => {
              const mod = await loaders[src]?.();
              return mod?.default ?? null;
            },
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

export function hasCategoryIndex(category, lang) {
  return (
    Object.keys(indexPages).some(
      (key) =>
        key === `./pages/${lang}/${category.toLowerCase()}.(index).md` ||
        key === `./pages/${lang}/${category.toLowerCase()}.(index).mdx`
    ) ||
    pages.some(
      ([, { frontmatter }]) => frontmatter?.slug === category.toLowerCase()
    )
  );
}

export function getPageFrontmatter(pathname, lang) {
  const allPages = getPages(pathname, lang);
  for (const { pages: categoryPages } of allPages) {
    const page = categoryPages.find((p) => p.isActive);
    if (page) return page.frontmatter;
  }
  return null;
}
