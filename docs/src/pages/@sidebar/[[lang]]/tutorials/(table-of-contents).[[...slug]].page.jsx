import { usePathname } from "@lazarv/react-server";

import { getTutorials } from "../../../../tutorials.mjs";
import Sidebar from "../../../../components/Sidebar.jsx";
import TableOfContents from "../../../../components/TableOfContents.jsx";

export default function TutorialSidebar({ lang }) {
  const pathname = usePathname();
  const tutorials = getTutorials(pathname, lang);

  const activeTutorial = tutorials.find((tutorial) => tutorial.isActive);

  const tutorialIndex = tutorials.indexOf(activeTutorial);
  const prev = tutorialIndex > 0 ? tutorials[tutorialIndex - 1] : null;
  const next = tutorials[tutorialIndex + 1] ?? null;

  return (
    <Sidebar>
      {prev && (
        <a
          href={prev.href}
          className="font-semibold whitespace-nowrap text-indigo-500 dark:text-yellow-600 mb-4"
        >
          ← {prev.frontmatter?.title}
        </a>
      )}
      <TableOfContents />
      {next && (
        <a
          href={next.href}
          className="font-semibold whitespace-nowrap text-indigo-500 dark:text-yellow-600 mt-4"
        >
          {next.frontmatter?.title} →
        </a>
      )}
    </Sidebar>
  );
}
