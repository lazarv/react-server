import { usePathname } from "@lazarv/react-server";

import NavigationLinks from "../../../../components/NavigationLinks.jsx";
import { getGuides } from "../../../../guides.mjs";

export default function GuideNavigation({ lang }) {
  const pathname = usePathname();
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

  return <NavigationLinks prev={prevGuide} next={nextGuide} />;
}
