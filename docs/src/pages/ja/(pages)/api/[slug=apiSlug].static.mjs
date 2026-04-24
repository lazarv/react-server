import { apiReferenceIndex } from "../../../../lib/api-reference.mjs";

export default () => apiReferenceIndex().map((p) => ({ slug: p.slug }));
