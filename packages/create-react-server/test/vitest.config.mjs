import { defineConfig } from "vitest/config";

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
  },
  publicDir: false,
});
