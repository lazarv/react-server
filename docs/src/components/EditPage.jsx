import { pages } from "../pages.mjs";
import { useLanguage, m } from "../i18n.mjs";

export default function EditPage({ pathname }) {
  const lang = useLanguage();
  const filename =
    pathname.split("/").length > 3
      ? pages
          .find(([filename]) =>
            filename.includes(pathname.replace(`/${lang}`, `/${lang}/(pages)`))
          )?.[0]
          ?.replace(/^\.\//, "/") ?? `/pages${pathname}.mdx`
      : pathname === `/${lang}/team`
        ? `/pages/${lang}/(pages)/team/index.mdx`
        : pathname === `/${lang}`
          ? `/pages/${lang}/index.mdx`
          : `/pages${pathname}.(index).mdx`;

  return (
    <a
      href={`https://github.com/lazarv/react-server/edit/main/docs/src${filename}`}
      target="_blank"
      rel="noreferrer"
      className="flex items-center gap-2 text-xs text-gray-600 hover:!text-gray-500 dark:!text-gray-500 dark:hover:!text-gray-400 hover:no-underline absolute right-4 top-0 z-50"
    >
      {m.EditPage_linkText()}
    </a>
  );
}
