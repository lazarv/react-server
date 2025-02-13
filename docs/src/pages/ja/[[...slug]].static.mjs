import { getPages } from "../../pages.mjs";

const pages = getPages("/", "ja").reduce((paths, { category, pages }) => {
  paths.push({
    path: `/ja/${category.toLowerCase()}`,
  });
  pages.forEach(({ langHref: path }) => paths.push({ path }));
  return paths;
}, []);

export default [...pages, { path: "/ja" }, { path: "/ja/404" }];
