import { describe, expect, it } from "vitest";

import {
  validateConfig,
  formatValidationErrors,
} from "@lazarv/react-server/config/validate.mjs";

// ─── Helpers ────────────────────────────────────────────────────────────────

/** Shorthand: expects validation to pass with no errors. */
function expectValid(config) {
  const result = validateConfig(config);
  if (!result.valid) {
    const paths = result.errors.map((e) => `${e.path}: ${e.message}`);
    throw new Error(
      `Expected valid config, got errors:\n  ${paths.join("\n  ")}`
    );
  }
  expect(result.valid).toBe(true);
  expect(result.errors).toHaveLength(0);
  return result;
}

/** Shorthand: expects validation to fail with specific error path(s). */
function expectInvalid(config, ...expectedPaths) {
  const result = validateConfig(config);
  expect(result.valid).toBe(false);
  for (const path of expectedPaths) {
    expect(result.errors.some((e) => e.path === path)).toBe(true);
  }
  return result;
}

/** Shorthand: expects a warning (valid but with warnings). */
function expectWarning(config, warningPath) {
  const result = validateConfig(config);
  expect(result.valid).toBe(true);
  expect(result.warnings.some((w) => w.path === warningPath)).toBe(true);
  return result;
}

// ═══════════════════════════════════════════════════════════════════════════
//  Baseline / empty
// ═══════════════════════════════════════════════════════════════════════════

describe("config validation — baseline", () => {
  it("accepts empty config", () => {
    expectValid({});
  });

  it("accepts undefined / null config", () => {
    expect(validateConfig(undefined).valid).toBe(true);
    expect(validateConfig(null).valid).toBe(true);
  });

  it("accepts null values for optional fields", () => {
    expectValid({ adapter: null, cors: null, inspect: null, vite: null });
  });
});

// ═══════════════════════════════════════════════════════════════════════════
//  Unknown keys
// ═══════════════════════════════════════════════════════════════════════════

describe("config validation — unknown keys", () => {
  it("rejects unknown top-level key", () => {
    expectInvalid({ foobar: true }, "foobar");
  });

  it("rejects unknown nested key in server.*", () => {
    expectInvalid({ server: { foobar: 42 } }, "server.foobar");
  });

  it("rejects unknown nested key in build.*", () => {
    expectInvalid({ build: { foobar: true } }, "build.foobar");
  });

  it("rejects unknown nested key in resolve.*", () => {
    expectInvalid({ resolve: { foobar: [] } }, "resolve.foobar");
  });

  it("rejects unknown nested key in ssr.*", () => {
    expectInvalid({ ssr: { foobar: "x" } }, "ssr.foobar");
  });

  it("rejects unknown nested key in css.*", () => {
    expectInvalid({ css: { foobar: true } }, "css.foobar");
  });

  it("rejects unknown nested key in optimizeDeps.*", () => {
    expectInvalid({ optimizeDeps: { foobar: true } }, "optimizeDeps.foobar");
  });

  it("rejects unknown nested key in cache.*", () => {
    expectInvalid({ cache: { foobar: true } }, "cache.foobar");
  });

  it("rejects unknown nested key in serverFunctions.*", () => {
    expectInvalid(
      { serverFunctions: { foobar: true } },
      "serverFunctions.foobar"
    );
  });

  it("rejects unknown nested key in mdx.*", () => {
    expectInvalid({ mdx: { foobar: true } }, "mdx.foobar");
  });

  it("provides did-you-mean suggestion for typos", () => {
    const result = validateConfig({ prot: 3000 });
    expect(result.errors[0].expected).toMatch(/Did you mean/);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
//  root
// ═══════════════════════════════════════════════════════════════════════════

describe("config validation — root", () => {
  it("accepts string", () => {
    expectValid({ root: "src/pages" });
  });

  it("rejects number", () => {
    expectInvalid({ root: 42 }, "root");
  });

  it("rejects boolean", () => {
    expectInvalid({ root: true }, "root");
  });
});

// ═══════════════════════════════════════════════════════════════════════════
//  base
// ═══════════════════════════════════════════════════════════════════════════

describe("config validation — base", () => {
  it("accepts string", () => {
    expectValid({ base: "/my-app/" });
  });

  it("rejects number", () => {
    expectInvalid({ base: 123 }, "base");
  });
});

// ═══════════════════════════════════════════════════════════════════════════
//  entry
// ═══════════════════════════════════════════════════════════════════════════

describe("config validation — entry", () => {
  it("accepts string", () => {
    expectValid({ entry: "./src/App.jsx" });
  });

  it("rejects array", () => {
    expectInvalid({ entry: ["a", "b"] }, "entry");
  });
});

// ═══════════════════════════════════════════════════════════════════════════
//  public
// ═══════════════════════════════════════════════════════════════════════════

describe("config validation — public", () => {
  it("accepts string", () => {
    expectValid({ public: "public" });
  });

  it("accepts false", () => {
    expectValid({ public: false });
  });

  it("rejects true", () => {
    expectInvalid({ public: true }, "public");
  });

  it("rejects number", () => {
    expectInvalid({ public: 42 }, "public");
  });
});

// ═══════════════════════════════════════════════════════════════════════════
//  name
// ═══════════════════════════════════════════════════════════════════════════

describe("config validation — name", () => {
  it("accepts string", () => {
    expectValid({ name: "my-app" });
  });

  it("rejects number", () => {
    expectInvalid({ name: 42 }, "name");
  });
});

// ═══════════════════════════════════════════════════════════════════════════
//  adapter
// ═══════════════════════════════════════════════════════════════════════════

describe("config validation — adapter", () => {
  it("accepts string", () => {
    expectValid({ adapter: "vercel" });
  });

  it("accepts function", () => {
    expectValid({ adapter: () => {} });
  });

  it("accepts [name, options] tuple", () => {
    expectValid({ adapter: ["cloudflare", { routes: true }] });
  });

  it("rejects number", () => {
    expectInvalid({ adapter: 42 }, "adapter");
  });

  it("rejects array with non-string first element", () => {
    expectInvalid({ adapter: [42, {}] }, "adapter");
  });

  it("warns on unknown adapter names", () => {
    expectWarning({ adapter: "unknown-adapter" }, "adapter");
  });

  it("does not warn on known adapters", () => {
    for (const name of [
      "aws",
      "azure",
      "azure-swa",
      "bun",
      "cloudflare",
      "deno",
      "docker",
      "firebase",
      "netlify",
      "singlefile",
      "vercel",
    ]) {
      const result = validateConfig({ adapter: name });
      expect(result.warnings).toHaveLength(0);
    }
  });
});

// ═══════════════════════════════════════════════════════════════════════════
//  plugins
// ═══════════════════════════════════════════════════════════════════════════

describe("config validation — plugins", () => {
  it("accepts array of objects", () => {
    expectValid({ plugins: [{ name: "test" }] });
  });

  it("accepts function", () => {
    expectValid({ plugins: () => [] });
  });

  it("accepts array with null items (conditional plugins)", () => {
    expectValid({ plugins: [null, false, undefined, { name: "p" }] });
  });

  it("accepts nested arrays (Vite PluginOption[])", () => {
    expectValid({ plugins: [[{ name: "a" }], [{ name: "b" }]] });
  });

  it("accepts [name, options] tuples", () => {
    expectValid({ plugins: [["my-plugin", { opt: true }]] });
  });

  it("rejects string", () => {
    expectInvalid({ plugins: "not-valid" }, "plugins");
  });

  it("rejects number", () => {
    expectInvalid({ plugins: 42 }, "plugins");
  });
});

// ═══════════════════════════════════════════════════════════════════════════
//  define
// ═══════════════════════════════════════════════════════════════════════════

describe("config validation — define", () => {
  it("accepts object", () => {
    expectValid({ define: { "process.env.FOO": JSON.stringify("bar") } });
  });

  it("rejects string", () => {
    expectInvalid({ define: "bad" }, "define");
  });

  it("rejects array", () => {
    expectInvalid({ define: [] }, "define");
  });
});

// ═══════════════════════════════════════════════════════════════════════════
//  envDir
// ═══════════════════════════════════════════════════════════════════════════

describe("config validation — envDir", () => {
  it("accepts string", () => {
    expectValid({ envDir: "./env" });
  });

  it("accepts false", () => {
    expectValid({ envDir: false });
  });

  it("rejects true", () => {
    expectInvalid({ envDir: true }, "envDir");
  });

  it("rejects number", () => {
    expectInvalid({ envDir: 42 }, "envDir");
  });
});

// ═══════════════════════════════════════════════════════════════════════════
//  envPrefix
// ═══════════════════════════════════════════════════════════════════════════

describe("config validation — envPrefix", () => {
  it("accepts string", () => {
    expectValid({ envPrefix: "MY_APP_" });
  });

  it("accepts string array", () => {
    expectValid({ envPrefix: ["MY_APP_", "VITE_"] });
  });

  it("rejects number", () => {
    expectInvalid({ envPrefix: 42 }, "envPrefix");
  });

  it("rejects boolean", () => {
    expectInvalid({ envPrefix: true }, "envPrefix");
  });
});

// ═══════════════════════════════════════════════════════════════════════════
//  cacheDir
// ═══════════════════════════════════════════════════════════════════════════

describe("config validation — cacheDir", () => {
  it("accepts string", () => {
    expectValid({ cacheDir: "node_modules/.cache" });
  });

  it("rejects number", () => {
    expectInvalid({ cacheDir: 123 }, "cacheDir");
  });
});

// ═══════════════════════════════════════════════════════════════════════════
//  external
// ═══════════════════════════════════════════════════════════════════════════

describe("config validation — external", () => {
  it("accepts string array", () => {
    expectValid({ external: ["pg", "mysql2"] });
  });

  it("accepts single string", () => {
    expectValid({ external: "pg" });
  });

  it("rejects number", () => {
    expectInvalid({ external: 42 }, "external");
  });

  it("rejects boolean", () => {
    expectInvalid({ external: true }, "external");
  });
});

// ═══════════════════════════════════════════════════════════════════════════
//  sourcemap
// ═══════════════════════════════════════════════════════════════════════════

describe("config validation — sourcemap", () => {
  it("accepts boolean", () => {
    expectValid({ sourcemap: true });
    expectValid({ sourcemap: false });
  });

  it('accepts "inline"', () => {
    expectValid({ sourcemap: "inline" });
  });

  it('accepts "hidden"', () => {
    expectValid({ sourcemap: "hidden" });
  });

  it('accepts "server"', () => {
    expectValid({ sourcemap: "server" });
  });

  it('accepts "server-inline"', () => {
    expectValid({ sourcemap: "server-inline" });
  });

  it("rejects unknown string", () => {
    expectInvalid({ sourcemap: "bogus" }, "sourcemap");
  });

  it("rejects number", () => {
    expectInvalid({ sourcemap: 42 }, "sourcemap");
  });
});

// ═══════════════════════════════════════════════════════════════════════════
//  compression
// ═══════════════════════════════════════════════════════════════════════════

describe("config validation — compression", () => {
  it("accepts boolean", () => {
    expectValid({ compression: true });
    expectValid({ compression: false });
  });

  it("rejects string", () => {
    expectInvalid({ compression: "gzip" }, "compression");
  });
});

// ═══════════════════════════════════════════════════════════════════════════
//  export
// ═══════════════════════════════════════════════════════════════════════════

describe("config validation — export", () => {
  it("accepts boolean", () => {
    expectValid({ export: true });
    expectValid({ export: false });
  });

  it("accepts function", () => {
    expectValid({ export: () => ["/"] });
  });

  it("accepts string array", () => {
    expectValid({ export: ["/", "/about"] });
  });

  it("accepts object array (path descriptors)", () => {
    expectValid({ export: [{ path: "/" }] });
    expectValid({
      export: [{ path: "/", filename: "index.html", outlet: "main" }],
    });
  });

  it("accepts mixed string and object array", () => {
    expectValid({ export: ["/", { path: "/about" }] });
  });

  it("rejects number", () => {
    expectInvalid({ export: 42 }, "export");
  });
});

// ═══════════════════════════════════════════════════════════════════════════
//  prerender
// ═══════════════════════════════════════════════════════════════════════════

describe("config validation — prerender", () => {
  it("accepts boolean", () => {
    expectValid({ prerender: true });
  });

  it("accepts object", () => {
    expectValid({ prerender: { timeout: 30000 } });
  });

  it("rejects string", () => {
    expectInvalid({ prerender: "yes" }, "prerender");
  });
});

// ═══════════════════════════════════════════════════════════════════════════
//  cluster
// ═══════════════════════════════════════════════════════════════════════════

describe("config validation — cluster", () => {
  it("accepts number", () => {
    expectValid({ cluster: 4 });
  });

  it("accepts boolean", () => {
    expectValid({ cluster: true });
  });

  it("rejects string", () => {
    expectInvalid({ cluster: "auto" }, "cluster");
  });
});

// ═══════════════════════════════════════════════════════════════════════════
//  cors
// ═══════════════════════════════════════════════════════════════════════════

describe("config validation — cors", () => {
  it("accepts boolean", () => {
    expectValid({ cors: true });
  });

  it("accepts object", () => {
    expectValid({ cors: { origin: "*", credentials: true } });
  });

  it("rejects string", () => {
    expectInvalid({ cors: "yes" }, "cors");
  });
});

// ═══════════════════════════════════════════════════════════════════════════
//  vite
// ═══════════════════════════════════════════════════════════════════════════

describe("config validation — vite", () => {
  it("accepts object", () => {
    expectValid({ vite: { build: { target: "esnext" } } });
  });

  it("accepts function", () => {
    expectValid({ vite: (config) => config });
  });

  it("rejects string", () => {
    expectInvalid({ vite: "bad" }, "vite");
  });
});

// ═══════════════════════════════════════════════════════════════════════════
//  customLogger
// ═══════════════════════════════════════════════════════════════════════════

describe("config validation — customLogger", () => {
  it("accepts object", () => {
    expectValid({ customLogger: { info: () => {}, warn: () => {} } });
  });

  it("rejects string", () => {
    expectInvalid({ customLogger: "pino" }, "customLogger");
  });
});

// ═══════════════════════════════════════════════════════════════════════════
//  logger
// ═══════════════════════════════════════════════════════════════════════════

describe("config validation — logger", () => {
  it("accepts string", () => {
    expectValid({ logger: "pino" });
  });

  it("accepts object", () => {
    expectValid({ logger: { level: "info" } });
  });

  it("rejects number", () => {
    expectInvalid({ logger: 42 }, "logger");
  });
});

// ═══════════════════════════════════════════════════════════════════════════
//  globalErrorComponent
// ═══════════════════════════════════════════════════════════════════════════

describe("config validation — globalErrorComponent", () => {
  it("accepts string glob", () => {
    expectValid({ globalErrorComponent: "**/ErrorBoundary.{jsx,tsx}" });
  });

  it("rejects boolean", () => {
    expectInvalid({ globalErrorComponent: true }, "globalErrorComponent");
  });
});

// ═══════════════════════════════════════════════════════════════════════════
//  handlers
// ═══════════════════════════════════════════════════════════════════════════

describe("config validation — handlers", () => {
  it("accepts function", () => {
    expectValid({ handlers: () => {} });
  });

  it("accepts array", () => {
    expectValid({ handlers: [() => {}, () => {}] });
  });

  it("accepts { pre, post } object", () => {
    expectValid({ handlers: { pre: [() => {}], post: [() => {}] } });
  });

  it("rejects string", () => {
    expectInvalid({ handlers: "bad" }, "handlers");
  });
});

// ═══════════════════════════════════════════════════════════════════════════
//  importMap
// ═══════════════════════════════════════════════════════════════════════════

describe("config validation — importMap", () => {
  it("accepts { imports: {} }", () => {
    expectValid({ importMap: { imports: { lodash: "/vendor/lodash.js" } } });
  });

  it("rejects string", () => {
    expectInvalid({ importMap: "bad" }, "importMap");
  });

  it("rejects array", () => {
    expectInvalid({ importMap: [] }, "importMap");
  });
});

// ═══════════════════════════════════════════════════════════════════════════
//  inspect
// ═══════════════════════════════════════════════════════════════════════════

describe("config validation — inspect", () => {
  it("accepts boolean", () => {
    expectValid({ inspect: true });
  });

  it("accepts object", () => {
    expectValid({ inspect: { build: true } });
  });

  it("rejects string", () => {
    expectInvalid({ inspect: "yes" }, "inspect");
  });
});

// ═══════════════════════════════════════════════════════════════════════════
//  runtime
// ═══════════════════════════════════════════════════════════════════════════

describe("config validation — runtime", () => {
  it("accepts function", () => {
    expectValid({ runtime: async () => ({ key: "value" }) });
  });

  it("accepts object", () => {
    expectValid({ runtime: { key: "value" } });
  });

  it("rejects string", () => {
    expectInvalid({ runtime: "bad" }, "runtime");
  });
});

// ═══════════════════════════════════════════════════════════════════════════
//  cookies
// ═══════════════════════════════════════════════════════════════════════════

describe("config validation — cookies", () => {
  it("accepts object", () => {
    expectValid({ cookies: { secure: true, sameSite: "lax" } });
  });

  it("rejects string", () => {
    expectInvalid({ cookies: "secure" }, "cookies");
  });
});

// ═══════════════════════════════════════════════════════════════════════════
//  host
// ═══════════════════════════════════════════════════════════════════════════

describe("config validation — host", () => {
  it("accepts string", () => {
    expectValid({ host: "0.0.0.0" });
  });

  it("accepts true", () => {
    expectValid({ host: true });
  });

  it("rejects false", () => {
    expectInvalid({ host: false }, "host");
  });

  it("rejects number", () => {
    expectInvalid({ host: 42 }, "host");
  });
});

// ═══════════════════════════════════════════════════════════════════════════
//  port
// ═══════════════════════════════════════════════════════════════════════════

describe("config validation — port", () => {
  it("accepts valid port number", () => {
    expectValid({ port: 3000 });
  });

  it("rejects string", () => {
    expectInvalid({ port: "3000" }, "port");
  });

  it("rejects negative port", () => {
    expectInvalid({ port: -1 }, "port");
  });

  it("rejects port > 65535", () => {
    expectInvalid({ port: 70000 }, "port");
  });

  it("rejects non-integer port", () => {
    expectInvalid({ port: 3000.5 }, "port");
  });
});

// ═══════════════════════════════════════════════════════════════════════════
//  console
// ═══════════════════════════════════════════════════════════════════════════

describe("config validation — console", () => {
  it("accepts boolean", () => {
    expectValid({ console: false });
    expectValid({ console: true });
  });

  it("rejects string", () => {
    expectInvalid({ console: "yes" }, "console");
  });
});

// ═══════════════════════════════════════════════════════════════════════════
//  overlay
// ═══════════════════════════════════════════════════════════════════════════

describe("config validation — overlay", () => {
  it("accepts boolean", () => {
    expectValid({ overlay: false });
    expectValid({ overlay: true });
  });

  it("rejects string", () => {
    expectInvalid({ overlay: "yes" }, "overlay");
  });
});

// ═══════════════════════════════════════════════════════════════════════════
//  assetsInclude
// ═══════════════════════════════════════════════════════════════════════════

describe("config validation — assetsInclude", () => {
  it("accepts string", () => {
    expectValid({ assetsInclude: "**/*.gltf" });
  });

  it("accepts RegExp", () => {
    expectValid({ assetsInclude: /\.gltf$/ });
  });

  it("accepts array of strings and RegExps", () => {
    expectValid({ assetsInclude: ["**/*.gltf", /\.hdr$/] });
  });

  it("rejects number", () => {
    expectInvalid({ assetsInclude: 42 }, "assetsInclude");
  });
});

// ═══════════════════════════════════════════════════════════════════════════
//  logLevel
// ═══════════════════════════════════════════════════════════════════════════

describe("config validation — logLevel", () => {
  it('accepts "info"', () => {
    expectValid({ logLevel: "info" });
  });

  it('accepts "warn"', () => {
    expectValid({ logLevel: "warn" });
  });

  it('accepts "error"', () => {
    expectValid({ logLevel: "error" });
  });

  it('accepts "silent"', () => {
    expectValid({ logLevel: "silent" });
  });

  it("rejects unknown string", () => {
    expectInvalid({ logLevel: "debug" }, "logLevel");
  });

  it("rejects number", () => {
    expectInvalid({ logLevel: 0 }, "logLevel");
  });
});

// ═══════════════════════════════════════════════════════════════════════════
//  clearScreen
// ═══════════════════════════════════════════════════════════════════════════

describe("config validation — clearScreen", () => {
  it("accepts boolean", () => {
    expectValid({ clearScreen: false });
  });

  it("rejects string", () => {
    expectInvalid({ clearScreen: "yes" }, "clearScreen");
  });
});

// ═══════════════════════════════════════════════════════════════════════════
//  server.*
// ═══════════════════════════════════════════════════════════════════════════

describe("config validation — server", () => {
  it("accepts empty server object", () => {
    expectValid({ server: {} });
  });

  it("rejects non-object", () => {
    expectInvalid({ server: "bad" }, "server");
  });

  describe("server.host", () => {
    it("accepts string", () => {
      expectValid({ server: { host: "0.0.0.0" } });
    });

    it("accepts true", () => {
      expectValid({ server: { host: true } });
    });

    it("rejects number", () => {
      expectInvalid({ server: { host: 42 } }, "server.host");
    });
  });

  describe("server.port", () => {
    it("accepts number", () => {
      expectValid({ server: { port: 8080 } });
    });

    it("rejects string", () => {
      expectInvalid({ server: { port: "8080" } }, "server.port");
    });
  });

  describe("server.https", () => {
    it("accepts boolean", () => {
      expectValid({ server: { https: true } });
    });

    it("accepts object", () => {
      expectValid({ server: { https: { key: "k", cert: "c" } } });
    });

    it("rejects string", () => {
      expectInvalid({ server: { https: "yes" } }, "server.https");
    });
  });

  describe("server.cors", () => {
    it("accepts boolean", () => {
      expectValid({ server: { cors: true } });
    });

    it("accepts object", () => {
      expectValid({ server: { cors: { origin: "*" } } });
    });

    it("rejects string", () => {
      expectInvalid({ server: { cors: "yes" } }, "server.cors");
    });
  });

  describe("server.open", () => {
    it("accepts boolean", () => {
      expectValid({ server: { open: true } });
    });

    it("accepts string", () => {
      expectValid({ server: { open: "/page" } });
    });

    it("rejects number", () => {
      expectInvalid({ server: { open: 42 } }, "server.open");
    });
  });

  describe("server.hmr", () => {
    it("accepts boolean", () => {
      expectValid({ server: { hmr: false } });
    });

    it("accepts object", () => {
      expectValid({ server: { hmr: { port: 24678 } } });
    });

    it("rejects string", () => {
      expectInvalid({ server: { hmr: "yes" } }, "server.hmr");
    });
  });

  describe("server.fs", () => {
    it("accepts { allow, deny, strict }", () => {
      expectValid({
        server: { fs: { allow: [".."], deny: [".env"], strict: true } },
      });
    });

    it("rejects non-object", () => {
      expectInvalid({ server: { fs: "bad" } }, "server.fs");
    });

    it("rejects non-string-array for allow", () => {
      expectInvalid({ server: { fs: { allow: 42 } } }, "server.fs.allow");
    });
  });

  describe("server.watch", () => {
    it("accepts object", () => {
      expectValid({ server: { watch: { usePolling: true } } });
    });

    it("rejects string", () => {
      expectInvalid({ server: { watch: "yes" } }, "server.watch");
    });
  });

  describe("server.origin", () => {
    it("accepts string", () => {
      expectValid({ server: { origin: "https://example.com" } });
    });

    it("rejects number", () => {
      expectInvalid({ server: { origin: 42 } }, "server.origin");
    });
  });

  describe("server.proxy", () => {
    it("accepts object", () => {
      expectValid({
        server: { proxy: { "/api": "http://localhost:4000" } },
      });
    });

    it("rejects string", () => {
      expectInvalid({ server: { proxy: "bad" } }, "server.proxy");
    });
  });

  describe("server.trustProxy", () => {
    it("accepts boolean", () => {
      expectValid({ server: { trustProxy: true } });
    });

    it("rejects string", () => {
      expectInvalid({ server: { trustProxy: "yes" } }, "server.trustProxy");
    });
  });

  describe("server.headers", () => {
    it("accepts object", () => {
      expectValid({ server: { headers: { "X-Custom": "value" } } });
    });

    it("rejects string", () => {
      expectInvalid({ server: { headers: "bad" } }, "server.headers");
    });
  });

  describe("server.warmup", () => {
    it("accepts object", () => {
      expectValid({
        server: { warmup: { clientFiles: ["./src/main.ts"] } },
      });
    });

    it("rejects string", () => {
      expectInvalid({ server: { warmup: "bad" } }, "server.warmup");
    });
  });
});

// ═══════════════════════════════════════════════════════════════════════════
//  resolve.*
// ═══════════════════════════════════════════════════════════════════════════

describe("config validation — resolve", () => {
  it("accepts empty resolve object", () => {
    expectValid({ resolve: {} });
  });

  it("rejects non-object", () => {
    expectInvalid({ resolve: "bad" }, "resolve");
  });

  describe("resolve.alias", () => {
    it("accepts plain object", () => {
      expectValid({ resolve: { alias: { "@": "./src" } } });
    });

    it("accepts array with string find", () => {
      expectValid({
        resolve: { alias: [{ find: "@", replacement: "./src" }] },
      });
    });

    it("accepts array with RegExp find", () => {
      expectValid({
        resolve: { alias: [{ find: /^@\//, replacement: "./src/" }] },
      });
    });

    it("rejects string", () => {
      expectInvalid({ resolve: { alias: "bad" } }, "resolve.alias");
    });
  });

  describe("resolve.dedupe", () => {
    it("accepts string array", () => {
      expectValid({ resolve: { dedupe: ["react", "react-dom"] } });
    });

    it("rejects string", () => {
      expectInvalid({ resolve: { dedupe: "react" } }, "resolve.dedupe");
    });
  });

  describe("resolve.noExternal", () => {
    it("accepts string array", () => {
      expectValid({ resolve: { noExternal: ["my-lib"] } });
    });

    it("accepts boolean", () => {
      expectValid({ resolve: { noExternal: true } });
    });

    it("accepts RegExp", () => {
      expectValid({ resolve: { noExternal: /my-lib/ } });
    });

    it("rejects number", () => {
      expectInvalid({ resolve: { noExternal: 42 } }, "resolve.noExternal");
    });
  });

  describe("resolve.shared", () => {
    it("accepts string array", () => {
      expectValid({ resolve: { shared: ["shared-utils"] } });
    });

    it("rejects string", () => {
      expectInvalid({ resolve: { shared: "bad" } }, "resolve.shared");
    });
  });

  describe("resolve.external", () => {
    it("accepts RegExp", () => {
      expectValid({ resolve: { external: /^node:/ } });
    });

    it("accepts string", () => {
      expectValid({ resolve: { external: "fs" } });
    });

    it("accepts string array", () => {
      expectValid({ resolve: { external: ["fs", "path"] } });
    });

    it("accepts function", () => {
      expectValid({ resolve: { external: () => true } });
    });

    it("rejects number", () => {
      expectInvalid({ resolve: { external: 42 } }, "resolve.external");
    });
  });

  describe("resolve.builtins", () => {
    it("accepts string array", () => {
      expectValid({ resolve: { builtins: ["my-builtin"] } });
    });

    it("rejects string", () => {
      expectInvalid({ resolve: { builtins: "bad" } }, "resolve.builtins");
    });
  });

  describe("resolve.conditions", () => {
    it("accepts string array", () => {
      expectValid({ resolve: { conditions: ["worker", "browser"] } });
    });

    it("rejects string", () => {
      expectInvalid(
        { resolve: { conditions: "worker" } },
        "resolve.conditions"
      );
    });
  });

  describe("resolve.extensions", () => {
    it("accepts string array", () => {
      expectValid({ resolve: { extensions: [".mjs", ".js", ".ts"] } });
    });

    it("rejects string", () => {
      expectInvalid({ resolve: { extensions: ".ts" } }, "resolve.extensions");
    });
  });

  describe("resolve.mainFields", () => {
    it("accepts string array", () => {
      expectValid({ resolve: { mainFields: ["module", "main"] } });
    });

    it("rejects string", () => {
      expectInvalid(
        { resolve: { mainFields: "module" } },
        "resolve.mainFields"
      );
    });
  });
});

// ═══════════════════════════════════════════════════════════════════════════
//  build.*
// ═══════════════════════════════════════════════════════════════════════════

describe("config validation — build", () => {
  it("accepts empty build object", () => {
    expectValid({ build: {} });
  });

  it("rejects non-object", () => {
    expectInvalid({ build: "bad" }, "build");
  });

  describe("build.target", () => {
    it("accepts string", () => {
      expectValid({ build: { target: "esnext" } });
    });

    it("accepts string array", () => {
      expectValid({ build: { target: ["es2020", "edge88"] } });
    });

    it("rejects number", () => {
      expectInvalid({ build: { target: 42 } }, "build.target");
    });
  });

  describe("build.outDir", () => {
    it("accepts string", () => {
      expectValid({ build: { outDir: "dist" } });
    });

    it("rejects number", () => {
      expectInvalid({ build: { outDir: 42 } }, "build.outDir");
    });
  });

  describe("build.assetsDir", () => {
    it("accepts string", () => {
      expectValid({ build: { assetsDir: "assets" } });
    });

    it("rejects number", () => {
      expectInvalid({ build: { assetsDir: 42 } }, "build.assetsDir");
    });
  });

  describe("build.minify", () => {
    it("accepts boolean", () => {
      expectValid({ build: { minify: true } });
    });

    it('accepts "terser"', () => {
      expectValid({ build: { minify: "terser" } });
    });

    it('accepts "esbuild"', () => {
      expectValid({ build: { minify: "esbuild" } });
    });

    it("rejects unknown string", () => {
      expectInvalid({ build: { minify: "uglify" } }, "build.minify");
    });
  });

  describe("build.cssMinify", () => {
    it("accepts boolean", () => {
      expectValid({ build: { cssMinify: true } });
    });

    it("accepts string", () => {
      expectValid({ build: { cssMinify: "lightningcss" } });
    });

    it("rejects number", () => {
      expectInvalid({ build: { cssMinify: 42 } }, "build.cssMinify");
    });
  });

  describe("build.cssCodeSplit", () => {
    it("accepts boolean", () => {
      expectValid({ build: { cssCodeSplit: true } });
    });

    it("rejects string", () => {
      expectInvalid({ build: { cssCodeSplit: "yes" } }, "build.cssCodeSplit");
    });
  });

  describe("build.assetsInlineLimit", () => {
    it("accepts number", () => {
      expectValid({ build: { assetsInlineLimit: 4096 } });
    });

    it("accepts function", () => {
      expectValid({ build: { assetsInlineLimit: () => 4096 } });
    });

    it("rejects string", () => {
      expectInvalid(
        { build: { assetsInlineLimit: "4096" } },
        "build.assetsInlineLimit"
      );
    });
  });

  describe("build.reportCompressedSize", () => {
    it("accepts boolean", () => {
      expectValid({ build: { reportCompressedSize: false } });
    });

    it("rejects string", () => {
      expectInvalid(
        { build: { reportCompressedSize: "yes" } },
        "build.reportCompressedSize"
      );
    });
  });

  describe("build.copyPublicDir", () => {
    it("accepts boolean", () => {
      expectValid({ build: { copyPublicDir: false } });
    });

    it("rejects string", () => {
      expectInvalid({ build: { copyPublicDir: "yes" } }, "build.copyPublicDir");
    });
  });

  describe("build.modulePreload", () => {
    it("accepts boolean", () => {
      expectValid({ build: { modulePreload: false } });
    });

    it("accepts object", () => {
      expectValid({ build: { modulePreload: { polyfill: false } } });
    });

    it("rejects string", () => {
      expectInvalid({ build: { modulePreload: "yes" } }, "build.modulePreload");
    });
  });

  describe("build.chunkSizeWarningLimit", () => {
    it("accepts number", () => {
      expectValid({ build: { chunkSizeWarningLimit: 2048 } });
    });

    it("rejects string", () => {
      expectInvalid(
        { build: { chunkSizeWarningLimit: "2048" } },
        "build.chunkSizeWarningLimit"
      );
    });
  });

  describe("build.lib", () => {
    it("accepts boolean", () => {
      expectValid({ build: { lib: true } });
    });

    it("rejects string", () => {
      expectInvalid({ build: { lib: "bad" } }, "build.lib");
    });
  });

  describe("build.rollupOptions", () => {
    it("accepts full shape", () => {
      expectValid({
        build: {
          rollupOptions: {
            external: ["lodash"],
            output: { format: "es" },
            plugins: [],
            input: "./src/main.ts",
            checks: {},
            treeshake: { moduleSideEffects: true },
          },
        },
      });
    });

    it("accepts external as function", () => {
      expectValid({
        build: { rollupOptions: { external: () => true } },
      });
    });

    it("accepts external as RegExp", () => {
      expectValid({
        build: { rollupOptions: { external: /^node:/ } },
      });
    });

    it("accepts input as object", () => {
      expectValid({
        build: { rollupOptions: { input: { main: "./src/main.ts" } } },
      });
    });

    it("accepts input as array", () => {
      expectValid({
        build: { rollupOptions: { input: ["./src/a.ts", "./src/b.ts"] } },
      });
    });

    it("accepts treeshake as boolean", () => {
      expectValid({
        build: { rollupOptions: { treeshake: false } },
      });
    });

    it("rejects non-object", () => {
      expectInvalid({ build: { rollupOptions: "bad" } }, "build.rollupOptions");
    });
  });

  describe("build.rolldownOptions", () => {
    it("accepts full shape", () => {
      expectValid({
        build: {
          rolldownOptions: {
            external: ["lodash"],
            output: {},
            plugins: [],
            input: { main: "./src/main.ts" },
            checks: {},
            treeshake: true,
          },
        },
      });
    });

    it("rejects non-object", () => {
      expectInvalid(
        { build: { rolldownOptions: "bad" } },
        "build.rolldownOptions"
      );
    });
  });

  describe("build.server", () => {
    it("accepts { config: object }", () => {
      expectValid({ build: { server: { config: {} } } });
    });

    it("accepts { config: function }", () => {
      expectValid({ build: { server: { config: () => ({}) } } });
    });

    it("rejects non-object", () => {
      expectInvalid({ build: { server: "bad" } }, "build.server");
    });
  });

  describe("build.client", () => {
    it("accepts { config: object }", () => {
      expectValid({ build: { client: { config: {} } } });
    });

    it("accepts { config: function }", () => {
      expectValid({ build: { client: { config: () => ({}) } } });
    });

    it("rejects non-object", () => {
      expectInvalid({ build: { client: "bad" } }, "build.client");
    });
  });
});

// ═══════════════════════════════════════════════════════════════════════════
//  ssr.*
// ═══════════════════════════════════════════════════════════════════════════

describe("config validation — ssr", () => {
  it("accepts empty ssr object", () => {
    expectValid({ ssr: {} });
  });

  it("rejects non-object", () => {
    expectInvalid({ ssr: "bad" }, "ssr");
  });

  describe("ssr.external", () => {
    it("accepts string array", () => {
      expectValid({ ssr: { external: ["pg", "mysql2"] } });
    });

    it("accepts boolean", () => {
      expectValid({ ssr: { external: true } });
    });

    it("rejects number", () => {
      expectInvalid({ ssr: { external: 42 } }, "ssr.external");
    });
  });

  describe("ssr.noExternal", () => {
    it("accepts string array", () => {
      expectValid({ ssr: { noExternal: ["my-ui-lib"] } });
    });

    it("accepts boolean", () => {
      expectValid({ ssr: { noExternal: true } });
    });

    it("accepts RegExp", () => {
      expectValid({ ssr: { noExternal: /my-lib/ } });
    });

    it("rejects number", () => {
      expectInvalid({ ssr: { noExternal: 42 } }, "ssr.noExternal");
    });
  });

  describe("ssr.resolve", () => {
    it("accepts object", () => {
      expectValid({ ssr: { resolve: { conditions: ["worker"] } } });
    });

    it("rejects string", () => {
      expectInvalid({ ssr: { resolve: "bad" } }, "ssr.resolve");
    });
  });

  describe("ssr.worker", () => {
    it("accepts boolean", () => {
      expectValid({ ssr: { worker: false } });
    });

    it("rejects string", () => {
      expectInvalid({ ssr: { worker: "yes" } }, "ssr.worker");
    });
  });
});

// ═══════════════════════════════════════════════════════════════════════════
//  css.*
// ═══════════════════════════════════════════════════════════════════════════

describe("config validation — css", () => {
  it("accepts empty css object", () => {
    expectValid({ css: {} });
  });

  it("rejects non-object", () => {
    expectInvalid({ css: "bad" }, "css");
  });

  describe("css.modules", () => {
    it("accepts object", () => {
      expectValid({ css: { modules: { localsConvention: "camelCase" } } });
    });

    it("rejects string", () => {
      expectInvalid({ css: { modules: "bad" } }, "css.modules");
    });
  });

  describe("css.preprocessorOptions", () => {
    it("accepts object", () => {
      expectValid({
        css: { preprocessorOptions: { scss: { additionalData: "$x: 1;" } } },
      });
    });

    it("rejects string", () => {
      expectInvalid(
        { css: { preprocessorOptions: "bad" } },
        "css.preprocessorOptions"
      );
    });
  });

  describe("css.postcss", () => {
    it("accepts string", () => {
      expectValid({ css: { postcss: "./postcss.config.js" } });
    });

    it("accepts object", () => {
      expectValid({ css: { postcss: { plugins: [] } } });
    });

    it("rejects number", () => {
      expectInvalid({ css: { postcss: 42 } }, "css.postcss");
    });
  });

  describe("css.devSourcemap", () => {
    it("accepts boolean", () => {
      expectValid({ css: { devSourcemap: true } });
    });

    it("rejects string", () => {
      expectInvalid({ css: { devSourcemap: "yes" } }, "css.devSourcemap");
    });
  });
});

// ═══════════════════════════════════════════════════════════════════════════
//  optimizeDeps.*
// ═══════════════════════════════════════════════════════════════════════════

describe("config validation — optimizeDeps", () => {
  it("accepts empty optimizeDeps object", () => {
    expectValid({ optimizeDeps: {} });
  });

  it("rejects non-object", () => {
    expectInvalid({ optimizeDeps: "bad" }, "optimizeDeps");
  });

  describe("optimizeDeps.include", () => {
    it("accepts string array", () => {
      expectValid({ optimizeDeps: { include: ["lodash"] } });
    });

    it("rejects string", () => {
      expectInvalid(
        { optimizeDeps: { include: "lodash" } },
        "optimizeDeps.include"
      );
    });
  });

  describe("optimizeDeps.exclude", () => {
    it("accepts string array", () => {
      expectValid({ optimizeDeps: { exclude: ["large-dep"] } });
    });

    it("rejects string", () => {
      expectInvalid(
        { optimizeDeps: { exclude: "large-dep" } },
        "optimizeDeps.exclude"
      );
    });
  });

  describe("optimizeDeps.force", () => {
    it("accepts boolean", () => {
      expectValid({ optimizeDeps: { force: true } });
    });

    it("rejects string", () => {
      expectInvalid({ optimizeDeps: { force: "yes" } }, "optimizeDeps.force");
    });
  });

  describe("optimizeDeps.rolldownOptions", () => {
    it("accepts object", () => {
      expectValid({ optimizeDeps: { rolldownOptions: {} } });
    });

    it("rejects string", () => {
      expectInvalid(
        { optimizeDeps: { rolldownOptions: "bad" } },
        "optimizeDeps.rolldownOptions"
      );
    });
  });

  describe("optimizeDeps.esbuildOptions", () => {
    it("accepts object", () => {
      expectValid({ optimizeDeps: { esbuildOptions: {} } });
    });

    it("rejects string", () => {
      expectInvalid(
        { optimizeDeps: { esbuildOptions: "bad" } },
        "optimizeDeps.esbuildOptions"
      );
    });
  });
});

// ═══════════════════════════════════════════════════════════════════════════
//  cache.*
// ═══════════════════════════════════════════════════════════════════════════

describe("config validation — cache", () => {
  it("accepts empty cache object", () => {
    expectValid({ cache: {} });
  });

  it("rejects non-object", () => {
    expectInvalid({ cache: "bad" }, "cache");
  });

  describe("cache.profiles", () => {
    it("accepts object", () => {
      expectValid({ cache: { profiles: { default: { ttl: 60 } } } });
    });

    it("accepts array", () => {
      expectValid({ cache: { profiles: [{ name: "default" }] } });
    });

    it("rejects string", () => {
      expectInvalid({ cache: { profiles: "bad" } }, "cache.profiles");
    });
  });

  describe("cache.providers", () => {
    it("accepts object", () => {
      expectValid({ cache: { providers: { memory: {} } } });
    });

    it("accepts array", () => {
      expectValid({ cache: { providers: [{ driver: "memory" }] } });
    });

    it("rejects string", () => {
      expectInvalid({ cache: { providers: "bad" } }, "cache.providers");
    });
  });
});

// ═══════════════════════════════════════════════════════════════════════════
//  serverFunctions.*
// ═══════════════════════════════════════════════════════════════════════════

describe("config validation — serverFunctions", () => {
  it("accepts empty object", () => {
    expectValid({ serverFunctions: {} });
  });

  it("rejects non-object", () => {
    expectInvalid({ serverFunctions: "bad" }, "serverFunctions");
  });

  describe("serverFunctions.secret", () => {
    it("accepts string", () => {
      expectValid({ serverFunctions: { secret: "my-secret" } });
    });

    it("rejects number", () => {
      expectInvalid(
        { serverFunctions: { secret: 42 } },
        "serverFunctions.secret"
      );
    });
  });

  describe("serverFunctions.secretFile", () => {
    it("accepts string", () => {
      expectValid({ serverFunctions: { secretFile: "./secret.pem" } });
    });

    it("rejects number", () => {
      expectInvalid(
        { serverFunctions: { secretFile: 42 } },
        "serverFunctions.secretFile"
      );
    });
  });

  describe("serverFunctions.previousSecrets", () => {
    it("accepts string array", () => {
      expectValid({
        serverFunctions: { previousSecrets: ["old-secret"] },
      });
    });

    it("rejects string", () => {
      expectInvalid(
        { serverFunctions: { previousSecrets: "bad" } },
        "serverFunctions.previousSecrets"
      );
    });
  });

  describe("serverFunctions.previousSecretFiles", () => {
    it("accepts string array", () => {
      expectValid({
        serverFunctions: { previousSecretFiles: ["./old.pem"] },
      });
    });

    it("rejects string", () => {
      expectInvalid(
        { serverFunctions: { previousSecretFiles: "bad" } },
        "serverFunctions.previousSecretFiles"
      );
    });
  });
});

// ═══════════════════════════════════════════════════════════════════════════
//  File-router child config: layout, page, middleware, api, router
// ═══════════════════════════════════════════════════════════════════════════

describe("config validation — file-router", () => {
  for (const key of ["layout", "page", "middleware", "api", "router"]) {
    describe(key, () => {
      it("accepts object", () => {
        expectValid({ [key]: {} });
      });

      it("accepts function", () => {
        expectValid({ [key]: () => ({}) });
      });

      it("rejects string", () => {
        expectInvalid({ [key]: "bad" }, key);
      });

      it("rejects number", () => {
        expectInvalid({ [key]: 42 }, key);
      });
    });
  }
});

// ═══════════════════════════════════════════════════════════════════════════
//  mdx.*
// ═══════════════════════════════════════════════════════════════════════════

describe("config validation — mdx", () => {
  it("accepts empty mdx object", () => {
    expectValid({ mdx: {} });
  });

  it("rejects non-object", () => {
    expectInvalid({ mdx: "bad" }, "mdx");
  });

  describe("mdx.remarkPlugins", () => {
    it("accepts array", () => {
      expectValid({ mdx: { remarkPlugins: [() => {}] } });
    });

    it("rejects string", () => {
      expectInvalid({ mdx: { remarkPlugins: "bad" } }, "mdx.remarkPlugins");
    });
  });

  describe("mdx.rehypePlugins", () => {
    it("accepts array", () => {
      expectValid({ mdx: { rehypePlugins: [() => {}] } });
    });

    it("rejects string", () => {
      expectInvalid({ mdx: { rehypePlugins: "bad" } }, "mdx.rehypePlugins");
    });
  });

  describe("mdx.components", () => {
    it("accepts string", () => {
      expectValid({ mdx: { components: "./mdx-components.jsx" } });
    });

    it("rejects number", () => {
      expectInvalid({ mdx: { components: 42 } }, "mdx.components");
    });
  });
});

// ═══════════════════════════════════════════════════════════════════════════
//  telemetry.*
// ═══════════════════════════════════════════════════════════════════════════

describe("config validation — telemetry", () => {
  it("accepts empty telemetry object", () => {
    expectValid({ telemetry: {} });
  });

  it("rejects non-object", () => {
    expectInvalid({ telemetry: "bad" }, "telemetry");
  });

  it("rejects unknown nested key", () => {
    expectInvalid({ telemetry: { foobar: true } }, "telemetry.foobar");
  });

  describe("telemetry.enabled", () => {
    it("accepts boolean true", () => {
      expectValid({ telemetry: { enabled: true } });
    });

    it("accepts boolean false", () => {
      expectValid({ telemetry: { enabled: false } });
    });

    it("rejects string", () => {
      expectInvalid({ telemetry: { enabled: "yes" } }, "telemetry.enabled");
    });
  });

  describe("telemetry.serviceName", () => {
    it("accepts string", () => {
      expectValid({ telemetry: { serviceName: "my-app" } });
    });

    it("rejects number", () => {
      expectInvalid(
        { telemetry: { serviceName: 42 } },
        "telemetry.serviceName"
      );
    });
  });

  describe("telemetry.endpoint", () => {
    it("accepts string", () => {
      expectValid({ telemetry: { endpoint: "http://localhost:4318" } });
    });

    it("rejects number", () => {
      expectInvalid({ telemetry: { endpoint: 4318 } }, "telemetry.endpoint");
    });
  });

  describe("telemetry.exporter", () => {
    it("accepts 'otlp'", () => {
      expectValid({ telemetry: { exporter: "otlp" } });
    });

    it("accepts 'console'", () => {
      expectValid({ telemetry: { exporter: "console" } });
    });

    it("accepts 'dev-console'", () => {
      expectValid({ telemetry: { exporter: "dev-console" } });
    });

    it("rejects unknown string", () => {
      expectInvalid(
        { telemetry: { exporter: "jaeger" } },
        "telemetry.exporter"
      );
    });
  });

  describe("telemetry.sampleRate", () => {
    it("accepts 0", () => {
      expectValid({ telemetry: { sampleRate: 0 } });
    });

    it("accepts 1", () => {
      expectValid({ telemetry: { sampleRate: 1 } });
    });

    it("accepts 0.5", () => {
      expectValid({ telemetry: { sampleRate: 0.5 } });
    });

    it("rejects value > 1", () => {
      expectInvalid({ telemetry: { sampleRate: 2 } }, "telemetry.sampleRate");
    });

    it("rejects negative value", () => {
      expectInvalid(
        { telemetry: { sampleRate: -0.1 } },
        "telemetry.sampleRate"
      );
    });

    it("rejects string", () => {
      expectInvalid(
        { telemetry: { sampleRate: "half" } },
        "telemetry.sampleRate"
      );
    });
  });

  describe("telemetry.metrics", () => {
    it("accepts empty metrics object", () => {
      expectValid({ telemetry: { metrics: {} } });
    });

    it("rejects non-object", () => {
      expectInvalid({ telemetry: { metrics: "bad" } }, "telemetry.metrics");
    });

    it("rejects unknown nested key", () => {
      expectInvalid(
        { telemetry: { metrics: { foobar: true } } },
        "telemetry.metrics.foobar"
      );
    });

    it("accepts metrics.enabled boolean", () => {
      expectValid({ telemetry: { metrics: { enabled: true } } });
    });

    it("rejects metrics.enabled string", () => {
      expectInvalid(
        { telemetry: { metrics: { enabled: "yes" } } },
        "telemetry.metrics.enabled"
      );
    });

    it("accepts metrics.interval integer >= 1000", () => {
      expectValid({ telemetry: { metrics: { interval: 5000 } } });
    });

    it("rejects metrics.interval below minimum", () => {
      expectInvalid(
        { telemetry: { metrics: { interval: 500 } } },
        "telemetry.metrics.interval"
      );
    });

    it("rejects metrics.interval string", () => {
      expectInvalid(
        { telemetry: { metrics: { interval: "5000" } } },
        "telemetry.metrics.interval"
      );
    });
  });

  it("accepts full telemetry config", () => {
    expectValid({
      telemetry: {
        enabled: true,
        serviceName: "my-service",
        endpoint: "http://localhost:4318",
        exporter: "otlp",
        sampleRate: 0.5,
        metrics: {
          enabled: true,
          interval: 30000,
        },
      },
    });
  });
});

// ═══════════════════════════════════════════════════════════════════════════
//  Multiple errors at once
// ═══════════════════════════════════════════════════════════════════════════

describe("config validation — multiple errors", () => {
  it("reports all errors in one pass", () => {
    const result = validateConfig({
      port: "not-a-number",
      base: 42,
      server: { port: true },
      unknown: "field",
    });
    expect(result.valid).toBe(false);
    expect(result.errors.length).toBeGreaterThanOrEqual(4);
    const paths = result.errors.map((e) => e.path);
    expect(paths).toContain("port");
    expect(paths).toContain("base");
    expect(paths).toContain("server.port");
    expect(paths).toContain("unknown");
  });
});

// ═══════════════════════════════════════════════════════════════════════════
//  formatValidationErrors
// ═══════════════════════════════════════════════════════════════════════════

describe("formatValidationErrors", () => {
  it("returns empty string for no errors", () => {
    expect(formatValidationErrors([])).toBe("");
  });

  it("includes error path in output", () => {
    const result = validateConfig({ port: "bad" });
    const output = formatValidationErrors(result.errors, { command: "build" });
    expect(output).toContain("port");
  });

  it("includes example in output when available", () => {
    const result = validateConfig({ port: "bad" });
    const output = formatValidationErrors(result.errors, { command: "build" });
    expect(output).toContain("3000");
  });

  it("includes build abort message for build command", () => {
    const result = validateConfig({ port: "bad" });
    const output = formatValidationErrors(result.errors, { command: "build" });
    expect(output).toContain("Build aborted");
  });

  it("includes dev restart hint for dev command", () => {
    const result = validateConfig({ port: "bad" });
    const output = formatValidationErrors(result.errors, { command: "dev" });
    expect(output).toContain("restart automatically");
  });

  it("shows warnings with warning title when no errors", () => {
    const result = validateConfig({ adapter: "my-custom-adapter" });
    const output = formatValidationErrors(result.warnings, { command: "dev" });
    expect(output).toContain("Warnings");
  });
});

// ═══════════════════════════════════════════════════════════════════════════
//  Real-world example configs
// ═══════════════════════════════════════════════════════════════════════════

describe("config validation — real-world configs", () => {
  it("accepts tanstack-router config", () => {
    expectValid({ root: "src/app", export: [{ path: "/" }] });
  });

  it("accepts spa config", () => {
    expectValid({ export: [{ path: "/" }] });
  });

  it("accepts test config", () => {
    expectValid({
      server: { hmr: false },
      console: false,
      overlay: false,
      cache: {
        providers: {
          indexedb: {
            driver: "unstorage/drivers/indexedb",
          },
        },
      },
    });
  });

  it("accepts express config", () => {
    expectValid({ base: "/app" });
  });

  it("accepts file-router config", () => {
    expectValid({ root: "pages" });
  });

  it("accepts docs config pattern", () => {
    expectValid({
      root: "src/pages",
      public: "public",
      adapter: "netlify",
      mdx: { remarkPlugins: [], rehypePlugins: [] },
      prerender: true,
      export: () => [],
    });
  });

  it("accepts complex full config", () => {
    expectValid({
      root: "src",
      base: "/app/",
      entry: "./src/App.jsx",
      public: "public",
      name: "my-app",
      adapter: "vercel",
      plugins: [{ name: "test-plugin" }],
      define: { __DEV__: "true" },
      envDir: "./env",
      envPrefix: ["MY_APP_", "VITE_"],
      cacheDir: "node_modules/.cache",
      external: ["pg"],
      sourcemap: "hidden",
      compression: true,
      export: ["/", "/about"],
      prerender: true,
      cluster: 4,
      cors: { origin: "*" },
      host: "0.0.0.0",
      port: 3000,
      console: true,
      overlay: true,
      logLevel: "info",
      clearScreen: false,
      server: {
        https: false,
        open: true,
        hmr: { port: 24678 },
        fs: { allow: [".."] },
        watch: { usePolling: true },
        origin: "https://example.com",
        proxy: { "/api": "http://localhost:4000" },
        trustProxy: true,
        headers: { "X-Custom": "value" },
        warmup: { clientFiles: ["./src/main.ts"] },
      },
      resolve: {
        alias: { "@": "./src" },
        dedupe: ["react"],
        shared: ["shared-utils"],
        conditions: ["worker"],
        extensions: [".ts"],
        mainFields: ["module"],
      },
      build: {
        target: "esnext",
        minify: "esbuild",
        chunkSizeWarningLimit: 2048,
        rollupOptions: { external: ["lodash"], treeshake: true },
        rolldownOptions: { input: { main: "./src/main.ts" } },
        server: { config: {} },
        client: { config: {} },
      },
      ssr: {
        external: ["pg"],
        noExternal: ["my-ui-lib"],
        resolve: { conditions: ["worker"] },
        worker: false,
      },
      css: {
        modules: { localsConvention: "camelCase" },
        preprocessorOptions: { scss: {} },
        postcss: "./postcss.config.js",
        devSourcemap: true,
      },
      optimizeDeps: {
        include: ["lodash"],
        exclude: ["large-dep"],
        force: true,
      },
      cache: { profiles: {}, providers: {} },
      serverFunctions: { secret: "key", secretFile: "./key.pem" },
      cookies: { secure: true },
      handlers: { pre: [], post: [] },
      importMap: { imports: {} },
      inspect: true,
      runtime: { key: "value" },
      vite: { build: {} },
      mdx: { remarkPlugins: [], rehypePlugins: [], components: "./mdx.jsx" },
      telemetry: {
        enabled: true,
        serviceName: "my-app",
        endpoint: "http://localhost:4318",
        exporter: "otlp",
        sampleRate: 1,
        metrics: { enabled: true, interval: 30000 },
      },
    });
  });
});
