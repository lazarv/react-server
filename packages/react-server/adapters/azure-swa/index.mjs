import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { cp } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import * as sys from "@lazarv/react-server/lib/sys.mjs";
import {
  banner,
  createAdapter,
  message,
  success,
  writeJSON,
} from "@lazarv/react-server/adapters/core";

const cwd = sys.cwd();
const outDir = join(cwd, ".azure-swa");
const outStaticDir = join(outDir, "static");
const adapterDir = dirname(fileURLToPath(import.meta.url));

/**
 * Build options for the Azure SWA adapter.
 * Uses edge build to bundle the server into a single file.
 */
export const buildOptions = {
  edge: {
    entry: join(adapterDir, "functions/entry.mjs"),
  },
};

export const adapter = createAdapter({
  name: "Azure Static Web Apps",
  outDir,
  outStaticDir,
  handler: async function ({
    adapterOptions,
    copy,
    options,
    reactServerOutDir,
  }) {
    banner("building Azure Functions", { emoji: "⚡" });

    const outServerDir = join(outDir, "functions/server");

    // Copy server files (includes the bundled edge.mjs, manifests, etc.)
    await copy.server(outServerDir);

    message("creating", "server function module");

    // Generate the Azure Functions wrapper that bridges Azure's (context, req)
    // model to the standard fetch handler in the bundled edge.mjs.
    // Azure Functions v3 doesn't provide a standard Web Request, so we
    // construct one from the Azure request object and convert the Response back.
    const entryFile = join(outServerDir, "index.mjs");
    writeFileSync(
      entryFile,
      `import handler from "./${reactServerOutDir}/server/edge.mjs";

export default async function (context, req) {
  try {
    // Use the original URL when SWA rewrites via navigationFallback
    const originalUrl = req.headers["x-ms-original-url"] || req.url;
    const proto = req.headers["x-forwarded-proto"] || "https";
    const host =
      req.headers["x-forwarded-host"] || req.headers.host || "localhost";

    let url;
    try {
      url = new URL(originalUrl);
    } catch {
      url = new URL(originalUrl, proto + "://" + host);
    }

    const init = {
      method: req.method,
      headers: req.headers,
    };
    if (
      req.method !== "GET" &&
      req.method !== "HEAD" &&
      (req.rawBody || req.body)
    ) {
      init.body =
        req.rawBody ??
        (typeof req.body === "string" ? req.body : JSON.stringify(req.body));
    }

    const request = new Request(url.href, init);
    const response = await handler(request);

    const headers = {};
    response.headers.forEach((value, key) => {
      if (key in headers) {
        headers[key] = Array.isArray(headers[key])
          ? [...headers[key], value]
          : [headers[key], value];
      } else {
        headers[key] = value;
      }
    });

    const body = Buffer.from(await response.arrayBuffer());

    context.res = {
      status: response.status,
      headers,
      body,
      isRaw: true,
    };
  } catch (e) {
    console.error(e);
    context.res = {
      status: 500,
      headers: { "Content-Type": "text/plain" },
      body: e.message || "Internal Server Error",
    };
  }
}
`
    );

    // Create function.json for Azure Functions v3 HTTP trigger
    await writeJSON(join(outServerDir, "function.json"), {
      bindings: [
        {
          authLevel: "anonymous",
          type: "httpTrigger",
          direction: "in",
          name: "req",
          methods: ["get", "post", "put", "delete", "patch", "head", "options"],
          route: "{*path}",
        },
        {
          type: "http",
          direction: "out",
          name: "res",
        },
      ],
    });

    // Create package.json at the functions root for ESM support
    writeFileSync(
      join(outDir, "functions/package.json"),
      JSON.stringify({ type: "module" }, null, 2)
    );

    success("server function initialized");

    banner("creating Azure configuration", { emoji: "⚙️" });

    // Generate host.json for Azure Functions
    message("creating", "host.json");
    const hostJson = {
      version: "2.0",
      extensionBundle: {
        id: "Microsoft.Azure.Functions.ExtensionBundle",
        version: "[4.*, 5.0.0)",
      },
      ...adapterOptions?.host,
    };
    await writeJSON(join(outDir, "functions/host.json"), hostJson);
    success("host.json created");

    // Generate staticwebapp.config.json for Azure Static Web Apps routing
    message("creating", "staticwebapp.config.json");
    const swaConfig = {
      routes: [
        {
          route: "/",
          rewrite: "/api/server",
        },
        {
          route: "/assets/*",
          headers: {
            "Cache-Control": "public, max-age=31536000, immutable",
          },
        },
        {
          route: "/client/*",
          headers: {
            "Cache-Control": "public, max-age=31536000, immutable",
          },
        },
        ...(adapterOptions?.routes ?? []),
      ],
      navigationFallback: {
        rewrite: "/api/server",
        exclude: ["/assets/*", "/client/*"],
      },
      platform: {
        apiRuntime: "node:20",
        ...adapterOptions?.platform,
      },
      ...adapterOptions?.staticwebapp,
    };

    // Merge with user's react-server.azure.json config if it exists
    const userConfigPath = join(cwd, "react-server.azure.json");
    if (existsSync(userConfigPath)) {
      try {
        const userConfig = JSON.parse(readFileSync(userConfigPath, "utf-8"));
        Object.assign(swaConfig, userConfig);
        message(
          "merging",
          "existing react-server.azure.json with adapter config"
        );
      } catch {
        // Ignore parsing errors
      }
    }

    await writeJSON(join(outDir, "staticwebapp.config.json"), swaConfig);
    success("staticwebapp.config.json created");

    // Copy staticwebapp.config.json to the static dir so SWA picks it up
    await cp(
      join(outDir, "staticwebapp.config.json"),
      join(outStaticDir, "staticwebapp.config.json")
    );

    // Azure SWA deployment tool requires an index.html in the static directory.
    // Create a minimal placeholder if one doesn't already exist from pre-rendering.
    // The route rule for "/" rewrites to the API function, so this file is not
    // actually served for the root path.
    const indexHtmlPath = join(outStaticDir, "index.html");
    if (!existsSync(indexHtmlPath)) {
      message("creating", "fallback index.html");
      writeFileSync(indexHtmlPath, "<!doctype html>");
    }

    // Generate local.settings.json for local development with Azure Functions
    message("creating", "local.settings.json");
    await writeJSON(join(outDir, "functions/local.settings.json"), {
      IsEncrypted: false,
      Values: {
        AzureWebJobsStorage: "",
        FUNCTIONS_WORKER_RUNTIME: "node",
        ...(options.sourcemap ? { NODE_OPTIONS: "--enable-source-maps" } : {}),
        ...adapterOptions?.env,
      },
    });
    success("local.settings.json created");
  },
  deploy: {
    command: "swa",
    args: [
      "deploy",
      ".azure-swa/static",
      "--api-location",
      ".azure-swa/functions",
      "--api-language",
      "node",
      "--api-version",
      "20",
    ],
  },
});

export default function defineConfig(adapterOptions) {
  return async (_, root, options) => adapter(adapterOptions, root, options);
}
