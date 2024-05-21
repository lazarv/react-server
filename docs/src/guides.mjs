import { relative } from "node:path";

import { defaultLanguage } from "./const.mjs";

const guides = Array.from(
  Object.entries(
    import.meta.glob("./pages/*/guide/**/*.{md,mdx}", { eager: true })
  )
);

export function getGuides(pathname, lang) {
  return Array.from(
    Object.entries(
      guides
        .filter(([mod]) => mod.includes(`${lang}/guide/`))
        .reduce(
          (categories, [mod, guide]) => ({
            ...categories,
            [guide.frontmatter.category ?? "Guide"]: [
              ...(categories[guide.frontmatter.category ?? "Guide"] ?? []),
              [mod, guide],
            ],
          }),
          {}
        )
    )
  )
    .sort(([a], [b]) =>
      a === "Guide" ? -1 : 1 - b === "Guide" ? -1 : 1 || a.localeCompare(b)
    )
    .map(([category, guides]) => ({
      category,
      guides: guides
        .sort(
          ([, { frontmatter: a }], [, { frontmatter: b }]) =>
            (a?.order ?? 0) - (b?.order ?? 0)
        )
        .map(([mod, { frontmatter }]) => {
          const href = `${lang !== defaultLanguage ? `/${lang}` : ""}/guide/${
            frontmatter?.slug ??
            relative(`./pages/${lang}/guide`, mod)
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
