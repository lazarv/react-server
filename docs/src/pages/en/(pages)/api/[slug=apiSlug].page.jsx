import ApiReferencePage from "../../../../components/ApiReferencePage.jsx";
import { apiReferenceIndex } from "../../../../lib/api-reference.mjs";

export const frontmatter = { category: "API" };

// Gate the `[slug=apiSlug]` segment: only slugs present in the
// published registry match this route. Anything else falls through to
// the site-wide 404 page — no middleware needed. The filename's
// `=apiSlug` alias is the key the file-router expects in the exported
// `matchers` object; the router wires it into `useMatch` for this
// route's dynamic segment.
const validApiSlugs = new Set(apiReferenceIndex().map((p) => p.slug));
export const matchers = {
  apiSlug: (value) => validApiSlugs.has(value),
};

export default function ApiPage({ slug }) {
  return <ApiReferencePage slug={slug} />;
}
