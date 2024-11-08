import { usePathname } from "@lazarv/react-server";

import Sidebar from "../../../../components/Sidebar.jsx";
import TableOfContents from "../../../../components/TableOfContents.jsx";
import { getPages } from "../../../../pages.mjs";

export default function Contents({ lang, category }) {
  const pathname = usePathname();
  const { frontmatter } = getPages(pathname, lang)
    .find(({ category: c }) => c.toLowerCase() === category.toLowerCase())
    ?.pages.find(({ langHref }) => langHref === pathname);

  if (frontmatter?.contents === false) return null;

  return (
    <Sidebar id="contents" menu="On this page" right>
      <TableOfContents />
    </Sidebar>
  );
}
