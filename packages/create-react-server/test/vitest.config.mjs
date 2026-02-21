import { basename, dirname, join } from "node:path";
import { defineConfig } from "vitest/config";

// Each CI matrix job sets PKG_MGR to a different package manager (npm, pnpm,
// bun).  The describe block embeds PKG_MGR in its name so every job only
// references the snapshot entries that belong to that particular PKG_MGR.
// Without per-PKG_MGR snapshot files, all entries for *other* package managers
// are detected as "obsolete" and vitest 4+ fails the run.
const PKG_MGR = process.env.PKG_MGR || "npm";

export default defineConfig({
  test: {
    include: ["**/__test__/**/*.spec.mjs"],
    testTimeout: 600_000, // 10 minutes per test (Docker operations are slow)
    hookTimeout: 600_000,
    reporters: process.env.GITHUB_ACTIONS
      ? ["verbose", "github-actions"]
      : ["verbose"],
    pool: "forks",
    disableConsoleIntercept: true,
    // Each spec file runs sequentially (one runtime at a time), but within
    // each file the presets run concurrently via describe.concurrent.
    fileParallelism: false,
    // Run 1 Docker container at a time to keep output readable and avoid
    // overwhelming the machine.
    maxConcurrency: 1,
    // Produce a separate snapshot file per PKG_MGR so that each CI matrix
    // job only sees its own snapshot entries and nothing appears obsolete.
    resolveSnapshotPath: (testPath, snapExtension) =>
      join(
        dirname(testPath),
        "__snapshots__",
        `${basename(testPath)}.${PKG_MGR}${snapExtension}`
      ),
  },
  publicDir: false,
});
