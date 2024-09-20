import { defaultLanguage } from "../../../../const.mjs";

export default function Breadcrumb({ lang, category }) {
  return (
    <a
      data-no-content
      href={`${lang === defaultLanguage ? "" : `/${lang}`}/${category}`}
      className="inline-block mb-2 text-md font-semibold capitalize text-indigo-500 dark:text-yellow-600"
    >
      {category} →
    </a>
  );
}
