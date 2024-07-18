import { getPages } from "../../pages.mjs";

const pages = getPages("/", "en").reduce((paths, { category, pages }) => {
  paths.push({
    path: `/${category.toLowerCase()}`,
  });
  pages.forEach(({ langHref: path }) => paths.push({ path }));
  return paths;
}, []);

export default [...pages, { path: "/" }, { path: "/404" }];
