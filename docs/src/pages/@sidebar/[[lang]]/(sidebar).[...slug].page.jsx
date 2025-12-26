import { basename } from "node:path";

import { usePathname } from "@lazarv/react-server";

import Sidebar from "../../../components/Sidebar.jsx";
import { defaultLanguage, defaultLanguageRE } from "../../../const.mjs";
import { hasCategory, getPages } from "../../../pages.mjs";
import { m } from "../../../i18n.mjs";

export default function PageSidebar({ lang, slug: [category] }) {
  const pathname = usePathname();

  if (!hasCategory(category)) {
    return null;
  }

  const pages = getPages(pathname, lang);

  return (
    <Sidebar id="sidebar" menu={m.sidebar_title()}>
      {pages.map(({ category, pages }, i) => (
        <div key={category} className="mb-4">
          <div
            className={`text-md font-semibold mb-2${i > 0 ? " pt-4 dark:border-gray-800" : ""}`}
          >
            {!pages.some(
              ({ frontmatter }) => frontmatter?.slug === category.toLowerCase()
            ) ? (
              <a
                href={`/${lang === defaultLanguage ? "" : `${lang}/`}${category.toLowerCase()}`}
                className={`mb-2${pathname.includes(`/${lang}/${category.toLowerCase()}`) ? " text-indigo-500 dark:text-yellow-600" : ""}`}
              >
                {m[`category_${category.toLowerCase()}`]()}
              </a>
            ) : (
              m[`category_${category.toLowerCase()}`]()
            )}
          </div>
          {pages
            .toSorted(
              ({ frontmatter: a }, { frontmatter: b }) =>
                (a?.order ?? 0) - (b?.order ?? 0)
            )
            .map(({ frontmatter, langHref, isActive, src }) => (
              <a
                key={src}
                href={langHref.replace(defaultLanguageRE, "")}
                className={`block pb-1 last:pb-0 after:mb-1 last:after:mb-0 text-sm pl-3 border-l border-gray-300 dark:border-gray-600${isActive ? " text-indigo-500 dark:text-yellow-600 active" : ""}`}
              >
                {frontmatter?.title ?? basename(src).replace(/\.mdx?$/, "")}
              </a>
            ))}
        </div>
      ))}
    </Sidebar>
  );
}
