import { pages } from "../pages.mjs";

export default function EditPage({ pathname }) {
  const filename =
    pathname.split("/").length > 3
      ? pages
          .find(([filename]) =>
            filename.includes(pathname.replace("/en", "/en/(pages)"))
          )?.[0]
          ?.replace(/^\.\//, "/") ?? ""
      : pathname === "/en/team"
        ? "/pages/en/(pages)/team/index.mdx"
        : pathname === "/en"
          ? "/pages/en/index.mdx"
          : `/pages${pathname}.(index).mdx`;
  return (
    <a
      href={`https://github.com/lazarv/react-server/edit/main/docs/src${filename}`}
      target="_blank"
      rel="noreferrer"
      className="flex items-center gap-2 text-xs text-gray-600 hover:!text-gray-500 dark:!text-gray-500 dark:hover:!text-gray-400 hover:no-underline absolute right-4 top-0 z-50"
    >
      Edit this page
    </a>
  );
}
