import { existsSync, readFileSync } from "node:fs";
import { mkdir, writeFile } from "node:fs/promises";
import { join, posix, relative } from "node:path";

import {
  banner,
  createAdapter,
  message,
  success,
} from "@lazarv/react-server/adapters/core";
import * as sys from "@lazarv/react-server/lib/sys.mjs";

const cwd = sys.cwd();
const outDir = join(cwd, "dist");

/**
 * Build options that the singlefile adapter requires.
 * Forces static export of the "/" path to produce index.html.
 */
export const buildOptions = () => ({
  export: true,
  exportPaths: ["/"],
});

export const adapter = createAdapter({
  name: "Singlefile",
  outDir,
  // No outStaticDir/outServerDir — we inline everything into a single HTML file
  handler: async function ({ files, config, reactServerDir }) {
    const distDir = join(reactServerDir, "dist");
    const base = config?.base ? `/${config.base}/`.replace(/\/+/g, "/") : "/";

    // Read the exported index.html
    const htmlPath = join(distDir, "index.html");
    if (!existsSync(htmlPath)) {
      throw new Error(
        `Static export not found at ${htmlPath}. ` +
          `The singlefile adapter requires a static export of the "/" path.`
      );
    }
    let html = readFileSync(htmlPath, "utf-8");

    // Get client JS modules and CSS asset files
    const clientMjsFiles = (await files.client()).filter((f) =>
      f.endsWith(".mjs")
    );
    const cssAssetFiles = (await files.assets()).filter((f) =>
      f.endsWith(".css")
    );

    // --- Inline CSS ---
    // CSS is referenced in two places:
    //   1. <link rel="stylesheet" href="/assets/X.css"> in the HTML <head>
    //   2. RSC flight data in <script> tags (React creates <link> elements at runtime)
    // We inline #1 as <style> tags, and replace #2 with data: URIs so React's
    // runtime link creation still works without fetching from a server.
    banner("inlining stylesheets", { emoji: "🎨" });
    for (const cssFile of cssAssetFiles) {
      const cssContent = readFileSync(join(reactServerDir, cssFile), "utf-8");
      const cssHref = `${base}${cssFile}`;
      const hrefPattern = cssHref.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

      // 1. Replace <link rel="stylesheet"> with <style>
      html = html.replace(
        new RegExp(`<link[^>]*href=["']${hrefPattern}["'][^>]*/?>`, "g"),
        () => `<style>${cssContent}</style>`
      );

      // 2. Replace ALL remaining references to the CSS path (in flight data,
      //    scripts, etc.) with a data: URI so React can still load it at runtime.
      const cssDataUri = `data:text/css;base64,${Buffer.from(cssContent).toString("base64")}`;
      // Use a global string replace (not regex) to catch all occurrences.
      // The CSS path may appear as "/assets/root-X.css" in various contexts
      // like :HL["/assets/root-X.css","style"] and {"href":"/assets/root-X.css"}
      html = html.split(cssHref).join(cssDataUri);
    }
    success(
      `${cssAssetFiles.length} stylesheet${cssAssetFiles.length !== 1 ? "s" : ""} inlined`
    );

    // --- Remove modulepreload links ---
    html = html.replace(/<link[^>]*rel=["']modulepreload["'][^>]*\/?>/g, "");

    // --- Remove dev-time preconnect/live-reload link ---
    html = html.replace(/<link[^>]*id=["']live-io["'][^>]*\/?>/g, "");

    // --- Build module source registry ---
    banner("inlining client modules", { emoji: "⚡" });
    const moduleSources = {};
    const baseEscaped = base.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

    for (const file of clientMjsFiles) {
      let source = readFileSync(join(reactServerDir, file), "utf-8");

      // Resolve relative imports to absolute paths first.
      // For "client/src/App.HASH.mjs" with import "../react.HASH.mjs",
      // we resolve relative to "/client/src/" → "/client/react.HASH.mjs"
      const moduleDir = posix.dirname(`${base}${file}`);

      const resolveRelative = (match, prefix, relPath, suffix) => {
        const resolved = posix.resolve(moduleDir, relPath);
        return `${prefix}${resolved}${suffix}`;
      };

      // Static imports/re-exports: from "./X.mjs" or from "../X.mjs"
      source = source.replace(
        /(from\s*["'])(\.\.?\/[^"']+)(["'])/g,
        resolveRelative
      );

      // Dynamic imports: import("./X.mjs") or import("../X.mjs")
      source = source.replace(
        /(import\s*\(\s*["'])(\.\.?\/[^"']+)(["']\s*\))/g,
        resolveRelative
      );

      // Side-effect imports: import "./X.mjs" or import "../X.mjs"
      source = source.replace(
        /(import\s+["'])(\.\.?\/[^"']+)(["'])/g,
        resolveRelative
      );

      // Convert ALL absolute path imports to bare specifiers by stripping
      // the leading base path (e.g. "/"). Blob: URLs can't resolve URL-like
      // specifiers (/client/foo.mjs) through the import map because the
      // specifier gets normalized against the blob URL, producing a mismatch.
      // Bare specifiers (client/foo.mjs) are matched as raw strings in the
      // import map, so they work regardless of the referrer's URL scheme.
      const stripBase = new RegExp(
        `((?:from|import)\\s*["'])${baseEscaped}([^"']+["'])`,
        "g"
      );
      source = source.replace(stripBase, "$1$2");

      // Also handle dynamic import("...") with absolute paths
      const stripBaseDynamic = new RegExp(
        `(import\\s*\\(\\s*["'])${baseEscaped}([^"']+["'])`,
        "g"
      );
      source = source.replace(stripBaseDynamic, "$1$2");

      // Use bare specifier as the key (no leading base path)
      moduleSources[`${file}`] = source;

      message(`  ${file}`);
    }
    success(
      `${clientMjsFiles.length} module${clientMjsFiles.length !== 1 ? "s" : ""} inlined`
    );

    // --- Find module entry points from <script type="module" src="..."> ---
    const entryModules = [];
    html = html.replace(
      /<script\b(?=[^>]*\btype=["']module["'])(?=[^>]*\bsrc=["']([^"']+)["'])[^>]*>\s*<\/script>/g,
      (match, src) => {
        // Strip leading base path to produce a bare specifier
        const bare = src.startsWith(base) ? src.slice(base.length) : src;
        entryModules.push(bare);
        // Remove the original script tag — the boot script will load it
        return "";
      }
    );

    // --- Rewrite __webpack_require__ to use bare specifiers ---
    // The original does: import(("/" + id).replace(/\/+/g, "/"))
    // which produces URL-like paths (/client/foo.mjs) that can't be resolved
    // from blob: URL modules. We change it to strip leading / so that
    // bare specifiers (client/foo.mjs) are used instead.
    html = html.replace(
      /import\(\("\\?\/"\s*\+\s*id\)\.replace\([^)]+\)\)/g,
      'import(id.replace(/^\\/+/,""))'
    );

    // --- Remove any existing static import map (we'll inject a dynamic one) ---
    let existingImportMap = null;
    html = html.replace(
      /<script\s+type=["']importmap["']>([\s\S]*?)<\/script>/,
      (match, existing) => {
        try {
          existingImportMap = JSON.parse(existing);
        } catch {}
        return "";
      }
    );

    // --- Build the boot script ---
    // This classic <script> runs before any modules, creates blob URLs for all
    // module sources, injects a dynamic import map, then loads the entry module.
    banner("writing singlefile HTML", { emoji: "📄" });

    // Base64-encode all module sources to avoid any escaping issues with
    // quotes, backticks, </script>, etc. inside JS module code.
    const moduleSourcesB64 = {};
    for (const [key, source] of Object.entries(moduleSources)) {
      moduleSourcesB64[key] = Buffer.from(source).toString("base64");
    }

    // The b64 map only contains [A-Za-z0-9+/=] values — safe to JSON.stringify
    // into a <script> without any special escaping.
    const moduleSourcesB64Json = JSON.stringify(moduleSourcesB64);
    const entryModulesJson = JSON.stringify(entryModules);
    // Strip leading base from existing import map keys too
    const existingImports = {};
    if (existingImportMap?.imports) {
      for (const [key, value] of Object.entries(existingImportMap.imports)) {
        const bareKey = key.startsWith(base) ? key.slice(base.length) : key;
        const bareVal =
          typeof value === "string" && value.startsWith(base)
            ? value.slice(base.length)
            : value;
        existingImports[bareKey] = bareVal;
      }
    }
    const existingImportsJson = JSON.stringify(existingImports);

    const bootScript =
      `<script>(function(){` +
      `var b=${moduleSourcesB64Json};` +
      `var m={};` +
      `for(var k in b)m[k]=URL.createObjectURL(new Blob([atob(b[k])],{type:"text/javascript"}));` +
      `var im=Object.assign(${existingImportsJson},m);` +
      `var map=document.createElement("script");` +
      `map.type="importmap";` +
      `map.textContent=JSON.stringify({imports:im});` +
      `document.currentScript.after(map);` +
      `var e=${entryModulesJson};` +
      `for(var i=0;i<e.length;i++){` +
      `var t=document.createElement("script");` +
      `t.type="module";` +
      `t.textContent="import "+JSON.stringify(e[i]);` +
      `document.head.appendChild(t);` +
      `}` +
      `})()</script>`;

    // Inject boot script at the very start of <head> (before any other scripts).
    // IMPORTANT: Use a replacer function to avoid $-pattern interpretation
    // in module source code (e.g. $`, $', $& from JS template literals).
    if (html.includes("<head")) {
      html = html.replace(
        /<head([^>]*)>/,
        (match, attrs) => `<head${attrs}>${bootScript}`
      );
    } else {
      // Fallback: prepend to document
      html = bootScript + html;
    }

    // Write the single HTML file
    await mkdir(outDir, { recursive: true });
    const outputPath = join(outDir, "index.html");
    await writeFile(outputPath, html);
    success(relative(cwd, outputPath));
  },
});
