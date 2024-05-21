import { getGuides } from "../../guides.mjs";

const guides = getGuides("/", "en").reduce((paths, { guides }) => {
  guides.forEach(({ langHref }) => paths.push(langHref));
  return paths;
}, []);

export default [
  ...guides.map((path) => ({ path })),
  { path: "/" },
  { path: "/team" },
  { path: "/404" },
];
