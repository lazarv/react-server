import { usePathname } from "@lazarv/react-server";

import NavigationLinks from "../../../../components/NavigationLinks.jsx";
import { getTutorials } from "../../../../tutorials.mjs";

export default function TutorialNavigation({ lang }) {
  const pathname = usePathname();
  const tutorials = getTutorials(pathname, lang);

  const activeTutorial = tutorials.find((tutorial) => tutorial.isActive);

  const tutorialIndex = tutorials.indexOf(activeTutorial);
  const prevTutorial = tutorialIndex > 0 ? tutorials[tutorialIndex - 1] : null;
  const nextTutorial = tutorials[tutorialIndex + 1] ?? null;

  return <NavigationLinks prev={prevTutorial} next={nextTutorial} />;
}
