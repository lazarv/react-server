import { useUrl } from "@lazarv/react-server";

import { getGuides } from "../../../../guides.mjs";

export default function Navigation({ lang }) {
  const { pathname } = useUrl();
  const guides = getGuides(pathname, lang);

  const activeSection = guides.find(({ guides }) =>
    guides.some((guide) => guide.isActive)
  );
  const activeGuide = activeSection?.guides.find((guide) => guide.isActive);

  const categoryIndex = guides.indexOf(activeSection);
  const guideIndex = activeSection?.guides.indexOf(activeGuide);
  const prevGuide =
    guideIndex > 0
      ? activeSection?.guides[guideIndex - 1]
      : categoryIndex > 0
        ? guides[categoryIndex - 1].guides[
            guides[categoryIndex - 1].guides.length - 1
          ]
        : null;
  const nextGuide =
    activeSection?.guides[guideIndex + 1] ??
    guides[categoryIndex + 1]?.guides[0] ??
    null;

  return (
    <div className="flex flex-wrap md:flex-row md:justify-between">
      {prevGuide && (
        <a
          href={prevGuide.href}
          className="text-sm font-semibold whitespace-nowrap hover:underline"
        >
          ← {prevGuide.category}: {prevGuide.frontmatter?.title}
        </a>
      )}

      {nextGuide && (
        <a
          href={nextGuide.href}
          className="text-sm font-semibold whitespace-nowrap ml-auto hover:underline"
        >
          {nextGuide.category}: {nextGuide.frontmatter?.title} →
        </a>
      )}
    </div>
  );
}
