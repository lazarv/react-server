import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { cwd, getEnv } from "../lib/sys.mjs";

const _cwd = cwd();

export async function importDist(path) {
  const outDir = getEnv("REACT_SERVER_OUT_DIR") || ".react-server";
  const resolvedPath = join(_cwd, outDir, path);
  return await import(pathToFileURL(resolvedPath));
}
