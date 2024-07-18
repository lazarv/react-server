export default function NavigationLinks({ prev, next }) {
  return (
    <div className="flex flex-wrap gap-2 md:flex-row md:justify-between">
      {prev && (
        <a
          href={prev.href}
          className="text-sm font-semibold whitespace-nowrap hover:underline"
        >
          ← {prev.category ? prev.category + ": " : ""}
          {prev.frontmatter?.title}
        </a>
      )}

      {next && (
        <a
          href={next.href}
          className="text-sm font-semibold whitespace-nowrap ml-auto hover:underline"
        >
          {next.category ? next.category + ": " : ""}
          {next.frontmatter?.title} →
        </a>
      )}
    </div>
  );
}
