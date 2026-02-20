import { existsSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

import { createStdioPort } from "./render-process-channel.mjs";
import { cwd as sysCwd } from "../sys.mjs";
import { generateDenoImportMap } from "../loader/deno.mjs";

export async function renderProcessSpawn() {
  const entry = fileURLToPath(new URL("./render-process.mjs", import.meta.url));
  const cwd = sysCwd();

  // Generate an import map without the "react-server" condition — the child
  // render process uses the default (client/SSR) aliases, not the RSC ones.
  const importMapPath = await generateDenoImportMap();

  const denoArgs = ["run"];

  // Deno config – prefer react-server.deno.json, fall back to deno.json
  const reactServerDenoConfigPath = join(cwd, "react-server.deno.json");
  const denoConfigPath = join(cwd, "deno.json");
  if (existsSync(reactServerDenoConfigPath)) {
    denoArgs.push("--config", reactServerDenoConfigPath);
  } else if (existsSync(denoConfigPath)) {
    denoArgs.push("--config", denoConfigPath);
  }

  denoArgs.push("--node-modules-dir=manual");
  denoArgs.push("-A");
  denoArgs.push("--import-map", importMapPath);
  denoArgs.push(entry);

  const env = Deno.env.toObject();
  env.__REACT_SERVER_DENO_IMPORT_MAP__ = "1";

  const child = new Deno.Command(Deno.execPath(), {
    cwd,
    args: denoArgs,
    stdin: "piped",
    stdout: "piped",
    stderr: "inherit",
    env,
  }).spawn();

  const port = createStdioPort(child.stdout, child.stdin);

  // Extend terminate to also kill the subprocess
  const _terminate = port.terminate;
  port.terminate = () => {
    _terminate();
    try {
      child.kill();
    } catch {
      // already exited
    }
  };

  return port;
}
