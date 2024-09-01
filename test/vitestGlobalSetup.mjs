import { readdir, rm } from "node:fs/promises";
import { join } from "node:path";

import { chromium } from "playwright-chromium";

let browserServer;

export async function setup({ provide }) {
  browserServer = await chromium.launchServer({
    headless: !process.env.REACT_SERVER_DEBUG,
    args: process.env.CI
      ? ["--no-sandbox", "--disable-setuid-sandbox"]
      : undefined,
  });
  provide("wsEndpoint", browserServer.wsEndpoint());
}

export async function teardown() {
  await browserServer.close();
  const files = await readdir(process.cwd(), { withFileTypes: true });
  await Promise.all(
    files
      .filter(
        (file) => file.isDirectory() && file.name.includes(".react-server")
      )
      .map((file) => rm(join(process.cwd(), file.name), { recursive: true }))
  );
}
