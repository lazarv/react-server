import { appDir, hostname, page, server } from "playground/utils";
import { expect, test } from "vitest";

// better-sqlite3 is a native Node.js addon incompatible with edge builds
test.skipIf(process.env.EDGE || process.env.EDGE_ENTRY)(
  "todo load",
  async () => {
    await server("./src/index.tsx", { cwd: appDir("examples/todo") });
    await page.goto(hostname);
    expect(await page.textContent("body")).toContain("Todo");
  }
);
