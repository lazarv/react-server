import { usePathname } from "@lazarv/react-server";

import NavigationLinks from "../../../components/NavigationLinks.jsx";
import { getPages } from "../../../pages.mjs";

export default function PagesNavigation({ lang }) {
  const pathname = usePathname();
  const pages = getPages(pathname, lang);

  const activeSection =
    pages.find(({ pages }) => pages.some((page) => page.isActive)) ??
    (pathname.split("/").length > 2
      ? pages.find(({ pages }) =>
          pages.some((page) => page.langHref.startsWith(pathname))
        )
      : null);

  if (!activeSection) {
    return null;
  }

  const activePage = activeSection?.pages.find((page) => page.isActive);

  const categoryIndex = pages.indexOf(activeSection);
  const pageIndex = activeSection?.pages.indexOf(activePage);
  const prevPage =
    pageIndex > 0
      ? activeSection?.pages[pageIndex - 1]
      : categoryIndex > 0
        ? pages[categoryIndex - 1].pages[
            pages[categoryIndex - 1].pages.length - 1
          ]
        : null;
  const nextPage =
    activeSection?.pages[pageIndex + 1] ??
    pages[categoryIndex + 1]?.pages[0] ??
    null;

  return <NavigationLinks prev={prevPage} next={nextPage} />;
}
