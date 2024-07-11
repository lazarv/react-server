import { relative } from "node:path";

import { defaultLanguage } from "./const.mjs";

const tutorials = Array.from(
  Object.entries(
    import.meta.glob("./pages/*/tutorials/**/*.{md,mdx}", { eager: true })
  )
);

export function getTutorials(pathname, lang) {
  return tutorials
    .filter(([mod]) => mod.includes(`${lang}/tutorials/`))
    .sort(
      ([, { frontmatter: a }], [, { frontmatter: b }]) =>
        (a?.order ?? 0) - (b?.order ?? 0)
    )
    .map(([mod, { frontmatter }]) => {
      const href = `${lang !== defaultLanguage ? `/${lang}` : ""}/tutorials/${
        frontmatter?.slug ??
        relative(`./pages/${lang}/tutorials`, mod)
          .replace(/\.mdx?$/, "")
          .replace(/[./]page$/, "")
      }`;
      const langHref = lang !== defaultLanguage ? href : `/${lang}${href}`;
      const isActive =
        pathname === langHref ||
        (frontmatter?.slug === "" && pathname === `/${lang}/tutorials`);
      return {
        href,
        langHref,
        isActive,
        frontmatter,
      };
    });
}
