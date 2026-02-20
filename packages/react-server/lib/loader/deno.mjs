import { dirname, join } from "node:path";
import { existsSync } from "node:fs";
import { mkdir, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";

import { getEnv, isDeno, cwd as sysCwd } from "../sys.mjs";
import { moduleAliases } from "./module-alias.mjs";

const cwd = sysCwd();

export async function generateDenoImportMap(options = {}) {
  const outDir = options?.outDir || ".react-server";
  const condition = options?.condition;

  const manifestLoaderPath = join(
    dirname(fileURLToPath(import.meta.url)),
    "manifest-loader.mjs"
  );

  // Build the .react-server/... specifier mappings
  const imports = {
    "@lazarv/react-server/dist/__react_server_config__/prebuilt": join(
      cwd,
      outDir,
      "server/__react_server_config__/prebuilt.mjs"
    ),
    "@lazarv/react-server/dist/server/render": join(
      cwd,
      outDir,
      "server/render.mjs"
    ),
    "@lazarv/react-server/dist/server/root": join(
      cwd,
      outDir,
      "server/root.mjs"
    ),
    "@lazarv/react-server/dist/server/error": join(
      cwd,
      outDir,
      "server/error.mjs"
    ),
    "@lazarv/react-server/dist/server/error-boundary": join(
      cwd,
      outDir,
      "server/error-boundary.mjs"
    ),
    "@lazarv/react-server/dist/server/render-dom": join(
      cwd,
      outDir,
      "server/render-dom.mjs"
    ),
    "@lazarv/react-server/dist/server/preload-manifest": join(
      cwd,
      outDir,
      "server/preload-manifest.mjs"
    ),
    "@lazarv/react-server/dist/manifest-registry": join(
      cwd,
      outDir,
      "server/manifest-registry.mjs"
    ),
    "@lazarv/react-server/dist/client/manifest-registry": join(
      cwd,
      outDir,
      "server/client/manifest-registry.mjs"
    ),
    "@lazarv/react-server/dist/server/build-manifest": join(
      cwd,
      outDir,
      "server/build-manifest.mjs"
    ),
    "@lazarv/react-server/dist/server/server-manifest": manifestLoaderPath,
    "@lazarv/react-server/dist/server/client-manifest": manifestLoaderPath,
    "@lazarv/react-server/dist/client/browser-manifest": manifestLoaderPath,
  };

  // Fallback specifiers: try outDir first, then package
  const clientRefMapPrimary = join(
    cwd,
    outDir,
    "server/client-reference-map.mjs"
  );
  imports["@lazarv/react-server/dist/server/client-reference-map"] = existsSync(
    clientRefMapPrimary
  )
    ? clientRefMapPrimary
    : fileURLToPath(
        import.meta
          .resolve("@lazarv/react-server/server/client-reference-map.mjs")
      );

  const serverRefMapPrimary = join(
    cwd,
    outDir,
    "server/server-reference-map.mjs"
  );
  imports["@lazarv/react-server/dist/server/server-reference-map"] = existsSync(
    serverRefMapPrimary
  )
    ? serverRefMapPrimary
    : fileURLToPath(
        import.meta
          .resolve("@lazarv/react-server/server/server-reference-map.mjs")
      );

  // Add module aliases (react, react-dom, etc.)
  const aliases = moduleAliases(condition);
  for (const [specifier, resolved] of Object.entries(aliases)) {
    if (resolved) {
      imports[specifier] = resolved;
    }
  }

  const importMap = { imports };
  const filename = condition
    ? `import-map.${condition}.json`
    : "import-map.json";
  const outPath = join(cwd, outDir, filename);
  await mkdir(join(cwd, outDir), { recursive: true });
  await writeFile(outPath, JSON.stringify(importMap, null, 2));
  return outPath;
}

export async function denoRespawn(options = {}) {
  if (!isDeno) return false;

  // If we already have the import map applied, don't respawn again
  if (getEnv("__REACT_SERVER_DENO_IMPORT_MAP__")) return false;

  const importMapPath = await generateDenoImportMap({
    ...options,
    condition: "react-server",
  });

  // Reconstruct args: insert --import-map before the script/module arg
  const originalArgs = Deno.args;
  const denoArgs = ["run"];

  // Find the original args from Deno.mainModule and Deno.args
  // Deno.mainModule is the script URL, Deno.args are the user args after the script
  const mainModule = Deno.mainModule;

  // Check for existing Deno config: prefer react-server.deno.json, fall back to deno.json
  const reactServerDenoConfigPath = join(cwd, "react-server.deno.json");
  const denoConfigPath = join(cwd, "deno.json");
  if (existsSync(reactServerDenoConfigPath)) {
    denoArgs.push("--config", reactServerDenoConfigPath);
  } else if (existsSync(denoConfigPath)) {
    denoArgs.push("--config", denoConfigPath);
  }

  // Ensure node_modules resolution works with pnpm/npm-managed node_modules
  denoArgs.push("--node-modules-dir=manual");

  denoArgs.push("-A");
  denoArgs.push("--import-map", importMapPath);

  // Add the main module (convert file:// URL to path, keep npm: as-is)
  if (mainModule.startsWith("file://")) {
    denoArgs.push(fileURLToPath(mainModule));
  } else {
    // npm: specifiers or other URL schemes — pass through directly
    denoArgs.push(mainModule);
  }

  // Add remaining user args
  denoArgs.push(...originalArgs);

  const env = Deno.env.toObject();
  env.__REACT_SERVER_DENO_IMPORT_MAP__ = "1";

  const cmd = new Deno.Command(Deno.execPath(), {
    cwd,
    args: denoArgs,
    stdin: "inherit",
    stdout: "inherit",
    stderr: "inherit",
    env,
  });
  const { code } = await cmd.output();
  Deno.exit(code);
}
