import { getPages } from "../pages.mjs";

const pages = getPages("/", "en").reduce((paths, { category, pages }) => {
  paths.push({
    path: `/${category.toLowerCase()}`,
  });
  pages.forEach(({ langHref: path }) => {
    if (!paths.some((p) => p.path === path.replace(/^\/en/, ""))) {
      paths.push({
        path: path.replace(/^\/en/, ""),
      });
    }
  });
  return paths;
}, []);

const site = [{ path: "/" }, ...pages];

const now = new Date().toISOString();

export default function Sitemap() {
  const sitemapXml = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${site
  .toSorted((a, b) => a.path.split("/").length - b.path.split("/").length)
  .map(({ path }) => {
    return `<url>
    <loc>https://react-server.dev${path.replace(/\/$/, "")}</loc>
    <lastmod>${now}</lastmod>
    <changefreq>daily</changefreq>
    <priority>${Math.ceil((1 - (path.replace(/\/$/, "").split("/").length - 1) * 0.2) * 10) / 10}</priority>
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
