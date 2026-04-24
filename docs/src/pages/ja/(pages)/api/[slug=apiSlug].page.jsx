import ApiReferencePage from "../../../../components/ApiReferencePage.jsx";
import { apiReferenceIndex } from "../../../../lib/api-reference.mjs";

export const frontmatter = { category: "API" };

// See the en-locale counterpart. The matcher rejects any slug not in
// the API reference registry so `ApiReferencePage` only ever runs for
// slugs it can actually render.
const validApiSlugs = new Set(apiReferenceIndex().map((p) => p.slug));
export const matchers = {
  apiSlug: (value) => validApiSlugs.has(value),
};

export default function ApiPage({ slug }) {
  return <ApiReferencePage slug={slug} />;
}
