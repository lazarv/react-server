import { useMatch } from "@lazarv/react-server/router";

import { defaultLanguage, languages } from "./const.mjs";
import * as _m from "./paraglide/messages.js";

export function useLanguage() {
  const { lang } = useMatch("/[lang=i18n]/[[...slug]]", {
    matchers: {
      i18n: (lang) => languages.includes(lang),
    },
  }) ?? { lang: defaultLanguage };

  return lang;
}

/**
 * @type {import("./paraglide/messages.js")}
 */
export const m = new Proxy(
  {},
  {
    get(_, prop) {
      return () => {
        const languageTag = useLanguage();
        try {
          return _m[prop]({}, { languageTag });
        } catch {
          return prop;
        }
      };
    },
  }
);
