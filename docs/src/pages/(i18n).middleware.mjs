import { redirect, rewrite, useUrl } from "@lazarv/react-server";
import { useMatch } from "@lazarv/react-server/router";

import { defaultLanguage, languages } from "../const.mjs";

// Pathnames that bypass locale resolution — they are language-agnostic
// resources or endpoints handled by other middlewares / API routes.
const NON_LOCALIZED = (pathname) =>
  pathname === "/sitemap.xml" ||
  pathname === "/schema.json" ||
  pathname === "/mcp" ||
  pathname.startsWith("/mcp/") ||
  pathname.startsWith("/.well-known/") ||
  pathname.startsWith("/md/") ||
  pathname.endsWith(".md");

export default function I18n() {
  const { pathname } = useUrl();

  if (NON_LOCALIZED(pathname)) {
    return;
  }

  const { lang, slug } = useMatch("/[lang=i18n]/[[...slug]]", {
    matchers: {
      i18n: (lang) => languages.includes(lang),
    },
  }) ?? { lang: null, slug: pathname.split("/").filter(Boolean) };

  if (lang === defaultLanguage) {
    redirect(`/${slug.join("/")}`);
  }

  if (!lang) {
    rewrite(slug.length > 0 ? `/en/${slug.join("/")}` : "/en");
  }
}
