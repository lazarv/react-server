import { useLanguage } from "../i18n.mjs";
import { defaultLanguage } from "../const.mjs";

export default function Pill({ children, href, ...props }) {
  const lang = useLanguage();

  return (
    <a
      className="rounded-full p-1 inline-flex items-center text-black hover:no-underline from-rose-400 via-fuchsia-500 to-indigo-500 bg-gradient-to-r hover:drop-shadow"
      href={
        href.startsWith("http")
          ? href
          : `${lang === defaultLanguage ? "" : `/${lang}`}${href}`
      }
      hrefLang={lang}
      {...props}
    >
      <div className="block rounded-full p-2 px-4 text-sm sm:text-base bg-white dark:bg-gray-900 dark:text-white hover:bg-transparent dark:hover:bg-transparent hover:text-white dark:hover:text-white">
        {children}
      </div>
    </a>
  );
}
