import { getGuides } from "../../guides.mjs";
import { getTutorials } from "../../tutorials.mjs";

const guides = getGuides("/", "en").reduce((paths, { guides }) => {
  guides.forEach(({ langHref: path }) => paths.push({ path }));
  return paths;
}, []);

const tutorials = getTutorials("/", "en").map(({ langHref: path }) => ({
  path,
}));

export default [
  ...guides,
  ...tutorials,
  { path: "/" },
  { path: "/team" },
  { path: "/404" },
];
