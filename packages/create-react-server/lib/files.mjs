import { readFile } from "node:fs/promises";
import { join } from "node:path";

export async function json(...path) {
  return JSON.parse(await readFile(join(...path), "utf8"));
}
