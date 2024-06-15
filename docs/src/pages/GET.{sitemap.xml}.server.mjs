import { getGuides } from "../guides.mjs";

const guides = getGuides("/", "en").reduce((paths, { guides }) => {
  guides.forEach(({ langHref }) => paths.push(langHref));
  return paths;
}, []);

const pages = [
  ...guides.map((path) => ({ path: path.replace(/^\/en/, "") })),
  { path: "/" },
  { path: "/team" },
];

const now = new Date().toISOString();

export default function Sitemap() {
  const sitemapXml = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${pages
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
