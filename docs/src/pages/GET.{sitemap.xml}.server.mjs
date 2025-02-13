import { defaultLanguage, languages } from "../const.mjs";
import { getPages } from "../pages.mjs";

const pages = languages
  .flatMap((lang) =>
    getPages("/", lang).reduce((paths, { category, pages }) => {
      paths.push(
        `${lang === defaultLanguage ? "" : `/${lang}`}/${category.toLowerCase()}`
      );
      pages.forEach(({ langHref: path }) => {
        if (
          !paths.includes(path) &&
          !paths.some((p) => p.path === path.replace(/^\/en/, ""))
        ) {
          paths.push(path);
        }
      });
      return paths;
    }, [])
  )
  .map((path) => ({ path }));

const site = [
  ...languages.map((lang) => ({
    path: lang === defaultLanguage ? "/" : `/${lang}`,
  })),
  ...pages,
];

const now = new Date().toISOString();

export default function Sitemap() {
  const sitemapXml = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9" xmlns:xhtml="http://www.w3.org/1999/xhtml">
${site
  .toSorted((a, b) => a.path.split("/").length - b.path.split("/").length)
  .map(({ path }) => {
    return `<url>
    <loc>https://react-server.dev${path.replace(/\/$/, "")}</loc>
    <lastmod>${now}</lastmod>
    <changefreq>daily</changefreq>
    <priority>${Math.ceil((1 - (path.replace(/\/$/, "").split("/").length - 1) * 0.2) * 10) / 10}</priority>
    ${languages.map((lang) => `<xhtml:link rel="alternate" hreflang="${lang}" href="https://react-server.dev${lang === defaultLanguage ? "" : `/${lang}`}${path.replace(new RegExp(`^/(${languages.join("|")})`), "").replace(/\/+$/, "")}" />`).join("\n")}
  </url>`;
  })
  .join("")}
</urlset>`
    // remove line breaks and leading spaces
    .replace(/\n\s*/g, "");

  return new Response(sitemapXml, {
    headers: {
      "Content-Type": "application/xml",
    },
  });
}
