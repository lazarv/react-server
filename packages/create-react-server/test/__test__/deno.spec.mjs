import { afterAll, beforeAll, describe, expect, it } from "vitest";

import {
  buildImage,
  cleanupImages,
  isDockerAvailable,
  packPackages,
  runTest,
} from "./utils.mjs";

const PRESETS = [
  "blank",
  "blank-ts",
  "get-started",
  "get-started-ts",
  "router",
  "nextjs",
];

// Package manager to use inside the container (npm, pnpm). Default: npm.
const PKG_MGR = process.env.PKG_MGR || "npm";

// Set to true to skip ALL Deno tests (e.g. if Deno Docker image is broken).
const DENO_SKIP = false;

describe.skipIf(!isDockerAvailable() || DENO_SKIP)(
  `create-react-server: deno runtime (${PKG_MGR})`,
  () => {
    beforeAll(() => {
      packPackages();
      buildImage("deno");
    }, 600_000);

    afterAll(() => {
      cleanupImages("deno");
    });

    // Run each preset sequentially — each gets its own Docker container.
    // The container runs once in beforeAll; individual test cases assert
    // each phase (creation, dev, build, start) independently.
    describe.each(PRESETS.map((p, i) => [p, i]))(
      "preset: %s",
      (preset, portOffset) => {
        let result;

        beforeAll(async () => {
          result = await runTest("deno", preset, "all", {
            portOffset,
            pkgMgr: PKG_MGR,
          });

          if (!result.passed) {
            console.log(`--- STDOUT (deno/${preset}) ---`);
            console.log(result.stdout);
            console.log(`--- STDERR (deno/${preset}) ---`);
            console.log(result.stderr);
          }
        }, 300_000);

        it("creates the app", () => {
          expect(result.creationOk, "app creation should succeed").toBe(true);
          expect(result.files, "generated file structure").toMatchSnapshot();
        });

        it("dev mode starts and serves the app", () => {
          expect(result.devOk, "dev mode should work").toBe(true);
        });

        it("builds the app", () => {
          expect(result.buildOk, "build should succeed").toBe(true);
        });

        it("starts in production mode", () => {
          expect(result.startOk, "production start should work").toBe(true);
        });
      }
    );
  }
);
