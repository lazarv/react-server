import { defaultLanguage } from "../../../../const.mjs";
import { hasCategory } from "../../../../pages.mjs";

export default function Breadcrumb({ lang, category }) {
  if (!hasCategory(category)) {
    return null;
  }

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
