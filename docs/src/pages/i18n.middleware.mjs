import { redirect, rewrite, useUrl } from "@lazarv/react-server";
import { useMatch } from "@lazarv/react-server/router";

import { defaultLanguage, languages } from "../const.mjs";

export default function I18n() {
  const { pathname } = useUrl();
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
