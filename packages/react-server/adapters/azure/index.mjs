import { existsSync, readFileSync } from "node:fs";
import { execSync } from "node:child_process";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { mkdir, writeFile } from "node:fs/promises";

import * as sys from "@lazarv/react-server/lib/sys.mjs";
import {
  banner,
  createAdapter,
  message,
  spawnCommand,
  success,
  writeJSON,
} from "@lazarv/react-server/adapters/core";

const cwd = sys.cwd();
const outDir = join(cwd, ".azure");
const outStaticDir = join(outDir, "static");
const outServerDir = join(outDir, "server");
const adapterDir = dirname(fileURLToPath(import.meta.url));

function resolveAppName(adapterOptions) {
  if (adapterOptions?.appName) return adapterOptions.appName;
  const packageJsonPath = join(cwd, "package.json");
  if (existsSync(packageJsonPath)) {
    try {
      const packageJson = JSON.parse(readFileSync(packageJsonPath, "utf-8"));
      return packageJson.name?.replace(/^@[^/]+\//, "");
    } catch {
      // Ignore parsing errors
    }
  }
  return null;
}

function az(args) {
  try {
    const result = execSync(`az ${args}`, {
      encoding: "utf-8",
      stdio: ["pipe", "pipe", "pipe"],
    });
    return result.trim();
  } catch (e) {
    // Capture stderr for better error messages
    if (e.stderr) {
      e.azError = e.stderr.toString().trim();
    }
    throw e;
  }
}

function azSafe(args) {
  try {
    return az(args);
  } catch {
    return null;
  }
}

function azJSON(args) {
  const result = azSafe(`${args} -o json`);
  if (!result) return null;
  try {
    return JSON.parse(result);
  } catch {
    return null;
  }
}

function sanitizeStorageName(name) {
  // Storage account names: 3-24 chars, lowercase alphanumeric only
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]/g, "")
    .slice(0, 24);
}

const BICEP_TEMPLATE = `@description('Name of the Function App')
param appName string

@description('Name of the Storage Account')
param storageName string

@description('Azure region for all resources')
param location string = resourceGroup().location

@description('Node.js runtime version')
param nodeVersion string = '20'

resource storageAccount 'Microsoft.Storage/storageAccounts@2023-05-01' = {
  name: storageName
  location: location
  sku: {
    name: 'Standard_LRS'
  }
  kind: 'StorageV2'
  properties: {
    supportsHttpsTrafficOnly: true
    minimumTlsVersion: 'TLS1_2'
    allowBlobPublicAccess: false
  }
}

resource hostingPlan 'Microsoft.Web/serverfarms@2023-12-01' = {
  name: '\${appName}-plan'
  location: location
  sku: {
    name: 'Y1'
    tier: 'Dynamic'
  }
  kind: 'functionapp,linux'
  properties: {
    reserved: true
  }
}

resource functionApp 'Microsoft.Web/sites@2023-12-01' = {
  name: appName
  location: location
  kind: 'functionapp,linux'
  properties: {
    serverFarmId: hostingPlan.id
    httpsOnly: true
    siteConfig: {
      linuxFxVersion: 'Node|\${nodeVersion}'
      appSettings: [
        {
          name: 'AzureWebJobsStorage'
          value: 'DefaultEndpointsProtocol=https;AccountName=\${storageAccount.name};EndpointSuffix=\${environment().suffixes.storage};AccountKey=\${storageAccount.listKeys().keys[0].value}'
        }
        {
          name: 'WEBSITE_CONTENTAZUREFILECONNECTIONSTRING'
          value: 'DefaultEndpointsProtocol=https;AccountName=\${storageAccount.name};EndpointSuffix=\${environment().suffixes.storage};AccountKey=\${storageAccount.listKeys().keys[0].value}'
        }
        {
          name: 'WEBSITE_CONTENTSHARE'
          value: toLower(appName)
        }
        {
          name: 'FUNCTIONS_EXTENSION_VERSION'
          value: '~4'
        }
        {
          name: 'FUNCTIONS_WORKER_RUNTIME'
          value: 'node'
        }
        {
          name: 'WEBSITE_NODE_DEFAULT_VERSION'
          value: '~\${nodeVersion}'
        }
        {
          name: 'AzureWebJobsFeatureFlags'
          value: 'EnableWorkerIndexing'
        }
      ]
    }
  }
}

output functionAppName string = functionApp.name
output functionAppHostName string = functionApp.properties.defaultHostName
`;

async function provision(appName, adapterOptions) {
  banner("provisioning Azure resources", { emoji: "☁️" });

  // Check az CLI is available and logged in
  const account = azJSON("account show");
  if (!account) {
    throw new Error(
      "Azure CLI is not installed or you are not logged in.\\n" +
        "  Install: https://aka.ms/install-azure-cli\\n" +
        "  Login:   az login"
    );
  }
  message("authenticated", account.name);

  const location = adapterOptions?.location ?? "eastus";
  const storageName =
    adapterOptions?.storageName ?? sanitizeStorageName(`${appName}store`);

  // Check if function app already exists (in specified or any resource group)
  let resourceGroup = adapterOptions?.resourceGroup;

  if (resourceGroup) {
    const existingApp = azJSON(
      `functionapp show --name ${appName} --resource-group ${resourceGroup}`
    );
    if (existingApp) {
      success(
        `function app "${appName}" already exists in "${resourceGroup}", skipping provisioning`
      );
      return;
    }
  } else {
    // Search all resource groups for this function app
    const apps = azJSON(`functionapp list --query "[?name=='${appName}']"`);
    if (apps && apps.length > 0) {
      const existingRg = apps[0].resourceGroup;
      success(
        `function app "${appName}" already exists in "${existingRg}", skipping provisioning`
      );
      return;
    }
    resourceGroup = `${appName}-rg`;
  }

  // Check if resource group exists, create if not
  const existingRg = azJSON(`group show --name ${resourceGroup}`);
  if (!existingRg) {
    message("creating", `resource group "${resourceGroup}" in ${location}`);
    az(`group create --name ${resourceGroup} --location ${location}`);
    success(`resource group "${resourceGroup}" created`);
  } else {
    message("found", `resource group "${resourceGroup}"`);
  }

  // Deploy Bicep template
  message("deploying", "Bicep template (storage + plan + function app)");
  const bicepPath = join(outDir, "main.bicep");
  const deployCmd =
    `deployment group create ` +
    `--resource-group ${resourceGroup} ` +
    `--template-file ${bicepPath} ` +
    `--parameters appName=${appName} storageName=${storageName} location=${location}`;

  try {
    az(`${deployCmd} -o json`);
  } catch (e) {
    const azErr = e.azError || e.message || "";
    throw new Error(
      `Bicep deployment failed.\n\n` +
        `  Azure error: ${azErr}\n\n` +
        `  Run manually to debug:\n` +
        `  az ${deployCmd}`,
      { cause: e }
    );
  }

  success(`Azure resources provisioned: ${resourceGroup}/${appName}`);
}

/**
 * Build options for the Azure Functions adapter.
 * Uses edge build to bundle the server into a single file.
 */
export const buildOptions = {
  edge: {
    entry: join(adapterDir, "functions/entry.mjs"),
  },
};

export const adapter = createAdapter({
  name: "Azure Functions",
  outDir,
  outStaticDir,
  outServerDir,
  handler: async function ({ adapterOptions, files, options }) {
    // Collect all static file paths for the route map
    banner("generating static file manifest", { emoji: "🗺️" });
    const [staticFiles, assetFiles, clientFiles, publicFiles] =
      await Promise.all([
        files.static(),
        files.assets(),
        files.client(),
        files.public(),
      ]);

    // Build the static file entries as a map from URL path to file path
    const staticMap = {};
    const addFile = (urlPath, filePath) => {
      staticMap[urlPath] = filePath;
    };

    for (const f of staticFiles) {
      addFile(`/${f}`, f);
      if (f.endsWith("/index.html")) {
        const dirPath = "/" + f.slice(0, -"/index.html".length);
        addFile(dirPath || "/", f);
      } else if (f === "index.html") {
        addFile("/", f);
      }
    }
    for (const f of assetFiles) addFile(`/${f}`, f);
    for (const f of clientFiles) addFile(`/${f}`, f);
    for (const f of publicFiles) addFile(`/${f}`, f);

    success(`${Object.keys(staticMap).length} static files mapped`);

    // Generate the Azure Functions v4 wrapper
    // @azure/functions MUST be external (not bundled) — the Azure Functions
    // runtime provides its own instance and monitors app.http() registrations.
    // The bundled edge.mjs is the react-server handler; this thin wrapper
    // bridges between Azure Functions and the edge handler.
    banner("creating Azure Functions v4 entry", { emoji: "⚡" });

    const staticMapJson = JSON.stringify(staticMap, null, 2);

    const functionEntry = `import { app } from "@azure/functions";
import { readFileSync } from "node:fs";
import { dirname, join, extname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const staticDir = join(__dirname, "../../static");
const serverDir = join(__dirname, "../../server/.react-server");

const MIME_TYPES = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".mjs": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".gif": "image/gif",
  ".svg": "image/svg+xml",
  ".ico": "image/x-icon",
  ".webp": "image/webp",
  ".avif": "image/avif",
  ".woff": "font/woff",
  ".woff2": "font/woff2",
  ".ttf": "font/ttf",
  ".otf": "font/otf",
  ".eot": "application/vnd.ms-fontobject",
  ".xml": "application/xml",
  ".txt": "text/plain; charset=utf-8",
  ".map": "application/json",
  ".webmanifest": "application/manifest+json",
  ".mp4": "video/mp4",
  ".webm": "video/webm",
  ".mp3": "audio/mpeg",
  ".wav": "audio/wav",
  ".pdf": "application/pdf",
  ".wasm": "application/wasm",
};

const STATIC_FILES = ${staticMapJson};

const CACHE_IMMUTABLE = "public, max-age=31536000, immutable";

process.chdir(serverDir);
const edgeHandler = (await import("../../server/.react-server/server/edge.mjs")).default;

app.http("server", {
  methods: ["GET", "POST", "PUT", "DELETE", "PATCH", "HEAD", "OPTIONS"],
  authLevel: "anonymous",
  route: "{*path}",
  handler: async (request, context) => {
    try {
      const url = new URL(request.url);
      const pathname = decodeURIComponent(url.pathname);

      // Try to serve static files first
      const staticFile = STATIC_FILES[pathname];
      if (staticFile) {
        const filePath = join(staticDir, staticFile);
        const ext = extname(staticFile);
        const contentType = MIME_TYPES[ext] || "application/octet-stream";
        const body = readFileSync(filePath);

        const headers = {
          "Content-Type": contentType,
          "Content-Length": body.length.toString(),
        };

        if (pathname.startsWith("/assets/") || pathname.startsWith("/client/")) {
          headers["Cache-Control"] = CACHE_IMMUTABLE;
        }

        return { status: 200, headers, body };
      }

      // Delegate to the react-server edge handler (supports streaming)
      const response = await edgeHandler(request, context);

      return {
        status: response.status,
        headers: Object.fromEntries(response.headers.entries()),
        body: response.body,
      };
    } catch (e) {
      context.error("Request handler error:", e);
      return {
        status: 500,
        headers: { "Content-Type": "text/plain" },
        body: e.message || "Internal Server Error",
      };
    }
  },
});
`;

    const srcFunctionsDir = join(outDir, "src/functions");
    await mkdir(srcFunctionsDir, { recursive: true });
    message("creating", "src/functions/server.mjs");
    await writeFile(join(srcFunctionsDir, "server.mjs"), functionEntry);
    success("Azure Functions v4 entry created");

    banner("creating Azure configuration", { emoji: "⚙️" });

    // Generate host.json for Azure Functions
    message("creating", "host.json");
    const hostJson = {
      version: "2.0",
      extensions: {
        http: {
          routePrefix: "",
        },
      },
      extensionBundle: {
        id: "Microsoft.Azure.Functions.ExtensionBundle",
        version: "[4.*, 5.0.0)",
      },
      ...adapterOptions?.host,
    };
    await writeJSON(join(outDir, "host.json"), hostJson);
    success("host.json created");

    // Generate package.json for the function app
    const appName = resolveAppName(adapterOptions);

    message("creating", "package.json");
    await writeJSON(join(outDir, "package.json"), {
      name: appName ?? "react-server-app",
      private: true,
      type: "module",
      main: "src/functions/server.mjs",
      scripts: {
        start: "func start",
      },
      dependencies: {
        "@azure/functions": "^4.0.0",
      },
    });
    success("package.json created");

    // Install @azure/functions — this package CANNOT be bundled because the
    // Azure Functions runtime provides its own instance and discovers
    // registered functions through it.
    message("installing", "@azure/functions");
    await spawnCommand("npm", ["install", "--prefix", outDir]);
    success("dependencies installed");

    // Generate local.settings.json for local development
    message("creating", "local.settings.json");
    await writeJSON(join(outDir, "local.settings.json"), {
      IsEncrypted: false,
      Values: {
        AzureWebJobsStorage: "",
        FUNCTIONS_WORKER_RUNTIME: "node",
        AzureWebJobsFeatureFlags: "EnableWorkerIndexing",
        ...(options.sourcemap ? { NODE_OPTIONS: "--enable-source-maps" } : {}),
        ...adapterOptions?.env,
      },
    });
    success("local.settings.json created");

    // Generate Bicep template for Azure provisioning
    message("creating", "main.bicep");
    await writeFile(join(outDir, "main.bicep"), BICEP_TEMPLATE);
    success("main.bicep created");
  },
  deploy: async ({ adapterOptions, options }) => {
    const appName = resolveAppName(adapterOptions);

    if (!appName) {
      return {
        command: "func",
        args: ["azure", "functionapp", "publish", "<app-name>", "--javascript"],
        cwd: outDir,
        message:
          "  Replace <app-name> with your Azure Functions app name,\n" +
          '  or set it via adapter options: adapter: ["azure", { appName: "my-app" }]\n' +
          '  or add a "name" field to your package.json.\n' +
          "  Install Azure Functions Core Tools: npm i -g azure-functions-core-tools@4",
      };
    }

    // Auto-provision Azure resources if deploying
    if (options.deploy) {
      await provision(appName, adapterOptions);
    }

    return {
      command: "func",
      args: ["azure", "functionapp", "publish", appName, "--javascript"],
      cwd: outDir,
      afterDeploy: () => {
        const url = `https://${appName}.azurewebsites.net`;
        banner(`deployed to ${url}`, { emoji: "🌐" });
      },
    };
  },
});

export default function defineConfig(adapterOptions) {
  return async (_, root, options) => adapter(adapterOptions, root, options);
}
