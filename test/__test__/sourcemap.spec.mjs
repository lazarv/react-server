import { readdir, readFile, rm } from "node:fs/promises";
import { join, resolve } from "node:path";
import { afterAll, describe, expect, test } from "vitest";

const isProduction = process.env.NODE_ENV === "production";

describe.skipIf(!isProduction)("sourcemap support", async () => {
  const cwd = process.cwd();
  const outDirSourcemap = ".react-server-build-sourcemap-on";
  const outDirNoSourcemap = ".react-server-build-sourcemap-off";
  const outDirServerInline = ".react-server-build-sourcemap-server-inline";
  const fixture = resolve(cwd, "fixtures/sourcemap.jsx");

  afterAll(async () => {
    await rm(join(cwd, outDirSourcemap), { recursive: true, force: true });
    await rm(join(cwd, outDirNoSourcemap), { recursive: true, force: true });
    await rm(join(cwd, outDirServerInline), { recursive: true, force: true });
  });

  test("build with sourcemap emits build-manifest.mjs and .map files", async () => {
    const { build } = await import("@lazarv/react-server/build");
    await build(fixture, {
      outDir: outDirSourcemap,
      server: true,
      client: true,
      export: false,
      adapter: ["false"],
      minify: false,
      sourcemap: true,
      silent: true,
    });

    // Verify build-manifest.mjs exists and contains sourcemap: true
    const manifestPath = join(
      cwd,
      outDirSourcemap,
      "server/build-manifest.mjs"
    );
    const manifestContent = await readFile(manifestPath, "utf8");
    expect(manifestContent).toContain("export default");
    expect(manifestContent).toContain('"sourcemap":true');

    // Verify .map files are generated in the server output
    const serverDir = join(cwd, outDirSourcemap, "server");
    const serverFiles = await readdir(serverDir);
    const mapFiles = serverFiles.filter((f) => f.endsWith(".map"));
    expect(mapFiles.length).toBeGreaterThan(0);
  });

  test("build without sourcemap emits build-manifest.mjs with sourcemap: false", async () => {
    const { build } = await import("@lazarv/react-server/build");
    await build(fixture, {
      outDir: outDirNoSourcemap,
      server: true,
      client: true,
      export: false,
      adapter: ["false"],
      minify: false,
      silent: true,
    });

    // Verify build-manifest.mjs exists and contains sourcemap: false
    const manifestPath = join(
      cwd,
      outDirNoSourcemap,
      "server/build-manifest.mjs"
    );
    const manifestContent = await readFile(manifestPath, "utf8");
    expect(manifestContent).toContain("export default");
    expect(manifestContent).toContain('"sourcemap":false');

    // Verify no .map files are generated
    const serverDir = join(cwd, outDirNoSourcemap, "server");
    const serverFiles = await readdir(serverDir);
    const mapFiles = serverFiles.filter((f) => f.endsWith(".map"));
    expect(mapFiles.length).toBe(0);
  });

  test("build with server-inline embeds source maps in server bundles only", async () => {
    const { build } = await import("@lazarv/react-server/build");
    await build(fixture, {
      outDir: outDirServerInline,
      server: true,
      client: true,
      export: false,
      adapter: ["false"],
      minify: false,
      sourcemap: "server-inline",
      silent: true,
    });

    // Verify build-manifest.mjs normalizes server-inline to inline
    const manifestPath = join(
      cwd,
      outDirServerInline,
      "server/build-manifest.mjs"
    );
    const manifestContent = await readFile(manifestPath, "utf8");
    expect(manifestContent).toContain('"sourcemap":"inline"');

    // Verify no separate .map files (inline embeds them)
    const serverDir = join(cwd, outDirServerInline, "server");
    const serverFiles = await readdir(serverDir);
    const mapFiles = serverFiles.filter((f) => f.endsWith(".map"));
    expect(mapFiles.length).toBe(0);
  });
});
