import * as sys from "../sys.mjs";

// Load JSON file - uses different strategies for Node.js vs edge runtime
export default async function loadJSON(path) {
  const importPath = sys.toFileUrl(path);
  try {
    if (sys.isEdgeRuntime) {
      // Edge runtime: import as module (wrangler bundles as Text, need to parse)
      const mod = await import(importPath);
      const value = mod.default ?? mod;
      return typeof value === "string" ? JSON.parse(value) : value;
    } else {
      // Node.js: use import assertion
      const mod = await import(importPath, { with: { type: "json" } });
      return mod.default;
    }
  } catch {
    // Fallback for Edge environments that need to import as JSON
    const mod = await import(importPath, { with: { type: "json" } });
    return mod.default;
  }
}
