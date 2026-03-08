import { describe, expect, it } from "vitest";

import {
  DESCRIPTIONS,
  generateJsonSchema,
} from "@lazarv/react-server/config/schema.mjs";

// ─── DESCRIPTIONS ───────────────────────────────────────────────────────────

describe("DESCRIPTIONS", () => {
  it("is an object", () => {
    expect(typeof DESCRIPTIONS).toBe("object");
    expect(DESCRIPTIONS).not.toBeNull();
  });

  it("has at least 50 entries", () => {
    expect(Object.keys(DESCRIPTIONS).length).toBeGreaterThanOrEqual(50);
  });

  it("every value is a non-empty string", () => {
    for (const [, val] of Object.entries(DESCRIPTIONS)) {
      expect(typeof val).toBe("string");
      expect(val.length).toBeGreaterThan(0);
    }
  });

  it("includes top-level keys", () => {
    const topLevel = [
      "root",
      "base",
      "entry",
      "adapter",
      "port",
      "host",
      "sourcemap",
      "compression",
      "cluster",
      "cors",
      "plugins",
    ];
    for (const key of topLevel) {
      expect(DESCRIPTIONS).toHaveProperty(key);
    }
  });

  it("includes nested keys with dot notation", () => {
    const nested = [
      "server.port",
      "server.host",
      "build.outDir",
      "build.minify",
      "resolve.alias",
      "css.modules",
      "optimizeDeps.include",
      "cache.profiles",
      "serverFunctions.secret",
      "mdx.remarkPlugins",
    ];
    for (const key of nested) {
      expect(DESCRIPTIONS).toHaveProperty(key);
    }
  });
});

// ─── generateJsonSchema ─────────────────────────────────────────────────────

describe("generateJsonSchema", () => {
  let schema;

  // Generate once, reuse across tests.
  function getSchema() {
    if (!schema) schema = generateJsonSchema();
    return schema;
  }

  it("returns a JSON Schema draft-07 object", () => {
    const s = getSchema();
    expect(s.$schema).toBe("http://json-schema.org/draft-07/schema#");
    expect(s.type).toBe("object");
    expect(s.title).toBe("react-server configuration");
    expect(typeof s.description).toBe("string");
  });

  it("has a $schema property for self-reference", () => {
    const s = getSchema();
    expect(s.properties).toHaveProperty("$schema");
    expect(s.properties.$schema.type).toBe("string");
  });

  it("includes all top-level config properties", () => {
    const s = getSchema();
    const requiredProps = [
      "root",
      "base",
      "entry",
      "public",
      "name",
      "adapter",
      "plugins",
      "define",
      "envDir",
      "envPrefix",
      "cacheDir",
      "external",
      "sourcemap",
      "compression",
      "export",
      "prerender",
      "cluster",
      "cors",
      "vite",
      "host",
      "port",
      "logLevel",
      "clearScreen",
      "telemetry",
    ];
    for (const prop of requiredProps) {
      expect(s.properties).toHaveProperty(prop);
    }
  });

  it("every property has a description", () => {
    const s = getSchema();
    for (const [key, val] of Object.entries(s.properties)) {
      if (key === "$schema") continue;
      expect(typeof val.description).toBe("string");
    }
  });

  // ── Type correctness ──────────────────────────────────────────────────

  it("port is an integer with min/max", () => {
    const s = getSchema();
    expect(s.properties.port.type).toBe("integer");
    expect(s.properties.port.minimum).toBe(0);
    expect(s.properties.port.maximum).toBe(65535);
  });

  it("sourcemap allows boolean or enum strings", () => {
    const s = getSchema();
    const sm = s.properties.sourcemap;
    expect(sm.oneOf).toBeDefined();
    const types = sm.oneOf.map((o) => o.type || "enum");
    expect(types).toContain("boolean");

    const enumBranch = sm.oneOf.find((o) => o.enum);
    expect(enumBranch.enum).toEqual(
      expect.arrayContaining(["inline", "hidden", "server"])
    );
  });

  it("adapter allows string or tuple array", () => {
    const s = getSchema();
    const a = s.properties.adapter;
    expect(a.oneOf).toBeDefined();
    const types = a.oneOf.map((o) => o.type);
    expect(types).toContain("string");
    expect(types).toContain("array");
  });

  it("logLevel is an enum", () => {
    const s = getSchema();
    expect(s.properties.logLevel.enum).toEqual([
      "info",
      "warn",
      "error",
      "silent",
    ]);
  });

  // ── Nested sub-schemas ────────────────────────────────────────────────

  it("server sub-schema has host, port, https, hmr, fs", () => {
    const srv = getSchema().properties.server;
    expect(srv.type).toBe("object");
    const keys = Object.keys(srv.properties);
    expect(keys).toEqual(
      expect.arrayContaining(["host", "port", "https", "hmr", "fs"])
    );
  });

  it("server.fs sub-schema has allow, deny, strict", () => {
    const fs = getSchema().properties.server.properties.fs;
    expect(fs.type).toBe("object");
    expect(fs.properties).toHaveProperty("allow");
    expect(fs.properties).toHaveProperty("deny");
    expect(fs.properties).toHaveProperty("strict");
  });

  it("resolve sub-schema has alias, dedupe, conditions", () => {
    const res = getSchema().properties.resolve;
    expect(res.type).toBe("object");
    const keys = Object.keys(res.properties);
    expect(keys).toEqual(
      expect.arrayContaining(["alias", "dedupe", "conditions"])
    );
  });

  it("build sub-schema has rollupOptions but not forbidden target, outDir, minify", () => {
    const b = getSchema().properties.build;
    expect(b.type).toBe("object");
    const keys = Object.keys(b.properties);
    expect(keys).toContain("rollupOptions");
    expect(keys).not.toContain("target");
    expect(keys).not.toContain("outDir");
    expect(keys).not.toContain("minify");
    expect(keys).not.toContain("sourcemap");
    expect(keys).not.toContain("emptyOutDir");
    expect(keys).not.toContain("manifest");
    expect(keys).not.toContain("ssr");
  });

  it("ssr sub-schema has external, noExternal, target, optimizeDeps", () => {
    const s = getSchema().properties.ssr;
    expect(s.type).toBe("object");
    expect(s.properties).toHaveProperty("external");
    expect(s.properties).toHaveProperty("noExternal");
    expect(s.properties).toHaveProperty("target");
    expect(s.properties).toHaveProperty("optimizeDeps");
  });

  it("css sub-schema has modules, preprocessorOptions, postcss", () => {
    const c = getSchema().properties.css;
    expect(c.type).toBe("object");
    expect(c.properties).toHaveProperty("modules");
    expect(c.properties).toHaveProperty("preprocessorOptions");
    expect(c.properties).toHaveProperty("postcss");
  });

  it("optimizeDeps sub-schema has include, exclude, force", () => {
    const o = getSchema().properties.optimizeDeps;
    expect(o.type).toBe("object");
    expect(o.properties).toHaveProperty("include");
    expect(o.properties).toHaveProperty("exclude");
    expect(o.properties).toHaveProperty("force");
  });

  it("cache sub-schema has profiles and providers", () => {
    const c = getSchema().properties.cache;
    expect(c.type).toBe("object");
    expect(c.properties).toHaveProperty("profiles");
    expect(c.properties).toHaveProperty("providers");
  });

  it("serverFunctions sub-schema has secret, secretFile, previousSecrets", () => {
    const sf = getSchema().properties.serverFunctions;
    expect(sf.type).toBe("object");
    expect(sf.properties).toHaveProperty("secret");
    expect(sf.properties).toHaveProperty("secretFile");
    expect(sf.properties).toHaveProperty("previousSecrets");
  });

  it("mdx sub-schema has remarkPlugins, rehypePlugins, components", () => {
    const m = getSchema().properties.mdx;
    expect(m.type).toBe("object");
    expect(m.properties).toHaveProperty("remarkPlugins");
    expect(m.properties).toHaveProperty("rehypePlugins");
    expect(m.properties).toHaveProperty("components");
  });

  // ── Serialisability ──────────────────────────────────────────────────

  it("round-trips through JSON.stringify/parse without loss", () => {
    const s = getSchema();
    const json = JSON.stringify(s);
    const parsed = JSON.parse(json);
    expect(parsed).toEqual(s);
  });

  it("does not contain undefined values", () => {
    const s = getSchema();
    const json = JSON.stringify(s);
    expect(json).not.toContain("undefined");
  });

  // ── additionalProperties ─────────────────────────────────────────────

  it("sets additionalProperties: false at root level", () => {
    const s = getSchema();
    expect(s.additionalProperties).toBe(false);
  });

  it("sets additionalProperties: false on nested object schemas", () => {
    const s = getSchema();
    const nested = [
      "server",
      "resolve",
      "build",
      "ssr",
      "css",
      "optimizeDeps",
      "cache",
      "serverFunctions",
      "mdx",
      "telemetry",
    ];
    for (const key of nested) {
      expect(s.properties[key].additionalProperties).toBe(false);
    }
  });

  // ── telemetry sub-schema ─────────────────────────────────────────────

  it("telemetry sub-schema has enabled, serviceName, endpoint, exporter, sampleRate, metrics", () => {
    const t = getSchema().properties.telemetry;
    expect(t.type).toBe("object");
    const keys = Object.keys(t.properties);
    expect(keys).toEqual(
      expect.arrayContaining([
        "enabled",
        "serviceName",
        "endpoint",
        "exporter",
        "sampleRate",
        "metrics",
      ])
    );
  });

  it("telemetry.enabled is boolean", () => {
    const t = getSchema().properties.telemetry;
    expect(t.properties.enabled.type).toBe("boolean");
  });

  it("telemetry.serviceName is string", () => {
    const t = getSchema().properties.telemetry;
    expect(t.properties.serviceName.type).toBe("string");
  });

  it("telemetry.endpoint is string", () => {
    const t = getSchema().properties.telemetry;
    expect(t.properties.endpoint.type).toBe("string");
  });

  it("telemetry.exporter is an enum of otlp, console, dev-console", () => {
    const t = getSchema().properties.telemetry;
    expect(t.properties.exporter.enum).toEqual([
      "otlp",
      "console",
      "dev-console",
    ]);
  });

  it("telemetry.sampleRate is number with min 0 max 1", () => {
    const t = getSchema().properties.telemetry;
    expect(t.properties.sampleRate.type).toBe("number");
    expect(t.properties.sampleRate.minimum).toBe(0);
    expect(t.properties.sampleRate.maximum).toBe(1);
  });

  it("telemetry.metrics sub-schema has enabled and interval", () => {
    const m = getSchema().properties.telemetry.properties.metrics;
    expect(m.type).toBe("object");
    expect(m.properties).toHaveProperty("enabled");
    expect(m.properties).toHaveProperty("interval");
    expect(m.properties.enabled.type).toBe("boolean");
    expect(m.properties.interval.type).toBe("integer");
    expect(m.properties.interval.minimum).toBe(1000);
    expect(m.additionalProperties).toBe(false);
  });
});
