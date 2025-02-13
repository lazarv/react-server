import { m } from "../i18n.mjs";

export default function NavigationLinks({ prev, next }) {
  return (
    <div className="w-full flex flex-wrap gap-2 md:flex-row md:justify-between">
      {prev && (
        <a
          href={prev.langHref}
          className="text-sm font-semibold whitespace-nowrap hover:underline"
        >
          ←{" "}
          {prev.category
            ? m[`category_${prev.category.toLowerCase()}`]() + ": "
            : ""}
          {prev.frontmatter?.title}
        </a>
      )}

      {next && (
        <a
          href={next.langHref}
          className="text-sm font-semibold whitespace-nowrap ml-auto hover:underline"
        >
          {next.category
            ? m[`category_${next.category.toLowerCase()}`]() + ": "
            : ""}
          {next.frontmatter?.title} →
        </a>
      )}
    </div>
  );
}
