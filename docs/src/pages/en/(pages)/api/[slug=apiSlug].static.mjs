import { apiReferenceIndex } from "../../../../lib/api-reference.mjs";

// Enumerate the SSG paths for `/api/:slug`. Each entry maps a dynamic
// route param to its value; the file-router expands these into concrete
// paths like `/en/api/core`, `/en/api/client`, …
export default () => apiReferenceIndex().map((p) => ({ slug: p.slug }));
