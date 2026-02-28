import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { cp, mkdir } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import * as sys from "@lazarv/react-server/lib/sys.mjs";
import {
  banner,
  clearDirectory,
  createAdapter,
  message,
  success,
  writeJSON,
} from "@lazarv/react-server/adapters/core";

const cwd = sys.cwd();
const outDir = join(cwd, ".aws");
const outStaticDir = join(outDir, "static");
const functionsDir = join(outDir, "functions");
const adapterDir = dirname(fileURLToPath(import.meta.url));

/**
 * Build options that the AWS Lambda adapter requires.
 * Uses edge build mode to bundle the server into a single file for Lambda deployment.
 */
export const buildOptions = {
  edge: {
    entry: join(adapterDir, "functions/handler.mjs"),
  },
};

export const adapter = createAdapter({
  name: "AWS Lambda",
  outDir,
  outStaticDir,
  handler: async function ({ adapterOptions, files, options }) {
    banner("building AWS Lambda function", { emoji: "⚡" });

    const outServerDir = join(functionsDir, "server");
    await clearDirectory(outServerDir);

    // Copy bundled server files
    await mkdir(join(outServerDir, ".react-server/server"), {
      recursive: true,
    });
    await cp(
      join(cwd, ".react-server/server/edge.mjs"),
      join(outServerDir, ".react-server/server/edge.mjs")
    );

    // Copy source map file if sourcemaps are enabled
    if (options.sourcemap) {
      const edgeMapPath = join(cwd, ".react-server/server/edge.mjs.map");
      if (existsSync(edgeMapPath)) {
        await cp(
          edgeMapPath,
          join(outServerDir, ".react-server/server/edge.mjs.map")
        );
      }
    }

    // Copy ALL static files into the Lambda deployment package.
    // The Lambda handler serves static files directly from disk with proper
    // Cache-Control headers. CloudFront caches responses at the edge, so
    // after the first request each static file is served from edge cache
    // without invoking Lambda.
    //
    // This avoids:
    //  - CloudFront Function size limits (10KB)
    //  - Origin Group failover limitations (GET/HEAD only)
    //  - Hardcoded path patterns that could conflict with user routes
    banner("bundling static files into Lambda package", { emoji: "📦" });

    // outStaticDir was already populated by createAdapter (copy.static,
    // copy.assets, copy.client, copy.public). Copy the assembled tree
    // into the Lambda package.
    await cp(outStaticDir, join(outServerDir, "static"), { recursive: true });

    // Build the static file manifest: URL path → relative file path on disk.
    // The Lambda handler loads this at cold-start for O(1) static file lookups.
    const [staticFiles, assetFiles, clientFiles, publicFiles] =
      await Promise.all([
        files.static(),
        files.assets(),
        files.client(),
        files.public(),
      ]);

    const manifest = {};
    for (const f of staticFiles) manifest[`/${f}`] = f;
    for (const f of assetFiles) manifest[`/${f}`] = f;
    for (const f of clientFiles) manifest[`/${f}`] = f;
    for (const f of publicFiles) manifest[`/${f}`] = f;

    writeFileSync(
      join(outServerDir, "static-manifest.json"),
      JSON.stringify(manifest)
    );

    success(`${Object.keys(manifest).length} static files bundled`);

    message("creating", "Lambda function handler");

    // Create index.mjs entry point that re-exports from the bundled server
    writeFileSync(
      join(outServerDir, "index.mjs"),
      `export { handler } from "./.react-server/server/edge.mjs";\n`
    );

    // Create package.json for ESM support in Lambda
    writeFileSync(
      join(outServerDir, "package.json"),
      JSON.stringify({ type: "module" }, null, 2)
    );

    success("Lambda function created");

    // ---- SAM template ----

    banner("creating AWS deployment configuration", { emoji: "⚙️" });

    // Resolve application name from adapter options or package.json
    let appName = adapterOptions?.name;
    if (!appName) {
      const packageJsonPath = join(cwd, "package.json");
      if (existsSync(packageJsonPath)) {
        try {
          const packageJson = JSON.parse(
            readFileSync(packageJsonPath, "utf-8")
          );
          appName = packageJson.name?.replace(/^@[^/]+\//, "");
        } catch {
          // Ignore parsing errors
        }
      }
    }
    appName = appName ?? "react-server-app";

    // Sanitize app name for use as CloudFormation resource names
    const sanitizedName = appName.replace(/[^a-zA-Z0-9]/g, "");
    const stackName = adapterOptions?.stackName ?? appName;

    const runtime = adapterOptions?.runtime ?? "nodejs20.x";
    const memorySize = adapterOptions?.memorySize ?? 1024;
    const timeout = adapterOptions?.timeout ?? 30;
    const architecture = adapterOptions?.architecture ?? "arm64";

    const samTemplate = {
      AWSTemplateFormatVersion: "2010-09-09",
      Transform: "AWS::Serverless-2016-10-31",
      Description: `${appName} - deployed with @lazarv/react-server`,
      Globals: {
        Function: {
          Timeout: timeout,
          Runtime: runtime,
          MemorySize: memorySize,
          Architectures: [architecture],
          Environment: {
            Variables: {
              NODE_ENV: "production",
              ...(options.sourcemap
                ? { NODE_OPTIONS: "--enable-source-maps" }
                : {}),
              ...adapterOptions?.environment,
            },
          },
        },
      },
      Resources: {
        // Lambda function with Function URL for streaming support.
        // The handler serves both static files and SSR responses.
        [`${sanitizedName}Function`]: {
          Type: "AWS::Serverless::Function",
          Properties: {
            CodeUri: ".aws/functions/server/",
            Handler: "index.handler",
            FunctionUrlConfig: {
              AuthType: adapterOptions?.authType ?? "NONE",
              InvokeMode: "RESPONSE_STREAM",
            },
            ...adapterOptions?.functionProperties,
          },
        },
        ...(adapterOptions?.cloudfront !== false
          ? {
              // Custom CachePolicy: respect origin Cache-Control headers.
              //
              // DefaultTTL/MinTTL = 0: CloudFront defers to the origin's
              // Cache-Control header. If the origin omits Cache-Control,
              // the response is not cached.
              //
              // MaxTTL = 1 year: allows immutable build assets (which set
              // max-age=31536000) to be cached at the edge for their full
              // lifetime.
              //
              // Cookies are excluded from the cache key so all users share
              // the same edge-cached static files. Cookies are still
              // forwarded to Lambda via the OriginRequestPolicy.
              [`${sanitizedName}CachePolicy`]: {
                Type: "AWS::CloudFront::CachePolicy",
                Properties: {
                  CachePolicyConfig: {
                    Name: `${stackName}-cache-policy`,
                    DefaultTTL: 0,
                    MinTTL: 0,
                    MaxTTL: 31536000,
                    ParametersInCacheKeyAndForwardedToOrigin: {
                      CookiesConfig: { CookieBehavior: "none" },
                      HeadersConfig: { HeaderBehavior: "none" },
                      QueryStringsConfig: { QueryStringBehavior: "all" },
                      EnableAcceptEncodingBrotli: true,
                      EnableAcceptEncodingGzip: true,
                    },
                  },
                },
              },
              // CloudFront distribution: single Lambda origin.
              //
              // Architecture:
              //   Viewer → CloudFront → Lambda (serves everything)
              //
              // The Lambda handler serves static files from its deployment
              // package with appropriate Cache-Control headers:
              //   - Build assets (content-hashed): immutable, 1 year
              //   - Pre-rendered HTML / x-component: must-revalidate
              //   - Public files: 10 minutes
              //   - Dynamic SSR: controlled by react-server
              //
              // CloudFront caches GET/HEAD responses at the edge based on
              // these headers, so after the first request each file is
              // served directly from the edge cache without Lambda.
              //
              // This design:
              //   ✓ No CloudFront Function size limits
              //   ✓ All HTTP methods work (POST for server actions, etc.)
              //   ✓ No hardcoded path patterns
              //   ✓ No Origin Group failover (only works for GET/HEAD)
              //   ✓ Scales to any number of static files
              [`${sanitizedName}Distribution`]: {
                Type: "AWS::CloudFront::Distribution",
                Properties: {
                  DistributionConfig: {
                    Enabled: true,
                    DefaultRootObject: "",
                    Origins: [
                      {
                        Id: "LambdaOrigin",
                        DomainName: {
                          "Fn::Select": [
                            2,
                            {
                              "Fn::Split": [
                                "/",
                                {
                                  "Fn::GetAtt": [
                                    `${sanitizedName}FunctionUrl`,
                                    "FunctionUrl",
                                  ],
                                },
                              ],
                            },
                          ],
                        },
                        CustomOriginConfig: {
                          OriginProtocolPolicy: "https-only",
                        },
                      },
                    ],
                    DefaultCacheBehavior: {
                      TargetOriginId: "LambdaOrigin",
                      ViewerProtocolPolicy: "redirect-to-https",
                      AllowedMethods: [
                        "GET",
                        "HEAD",
                        "OPTIONS",
                        "PUT",
                        "POST",
                        "PATCH",
                        "DELETE",
                      ],
                      CachedMethods: ["GET", "HEAD"],
                      CachePolicyId: {
                        Ref: `${sanitizedName}CachePolicy`,
                      },
                      // Forward all viewer values except Host to Lambda
                      OriginRequestPolicyId:
                        "b689b0a8-53d0-40ab-baf2-68738e2966ac",
                      Compress: true,
                    },
                    ...adapterOptions?.cloudfront?.distributionConfig,
                  },
                },
              },
            }
          : {}),
        // Optional S3 bucket for static file sync.
        // Not used by CloudFront — serves as a sync target for
        // 'aws s3 sync .aws/static/ s3://<bucket>/' or as an
        // external asset store when needed.
        ...(adapterOptions?.s3Bucket !== false
          ? {
              [`${sanitizedName}StaticBucket`]: {
                Type: "AWS::S3::Bucket",
                Properties: {
                  BucketName:
                    adapterOptions?.s3Bucket?.bucketName ??
                    `${stackName}-static`,
                  ...adapterOptions?.s3Bucket?.properties,
                },
              },
            }
          : {}),
        ...adapterOptions?.resources,
      },
      Outputs: {
        [`${sanitizedName}FunctionUrl`]: {
          Description: "Lambda Function URL",
          Value: {
            "Fn::GetAtt": [`${sanitizedName}FunctionUrl`, "FunctionUrl"],
          },
        },
        ...(adapterOptions?.cloudfront !== false
          ? {
              [`${sanitizedName}DistributionDomain`]: {
                Description: "CloudFront distribution domain",
                Value: {
                  "Fn::GetAtt": [`${sanitizedName}Distribution`, "DomainName"],
                },
              },
            }
          : {}),
        ...(adapterOptions?.s3Bucket !== false
          ? {
              [`${sanitizedName}StaticBucketName`]: {
                Description:
                  "S3 bucket for static assets (optional sync target)",
                Value: { Ref: `${sanitizedName}StaticBucket` },
              },
            }
          : {}),
        ...adapterOptions?.outputs,
      },
    };

    // Allow user to override or extend the template
    const finalTemplate = adapterOptions?.template
      ? typeof adapterOptions.template === "function"
        ? adapterOptions.template(samTemplate)
        : { ...samTemplate, ...adapterOptions.template }
      : samTemplate;

    message("creating", "SAM template (template.json)");

    // Write as JSON (SAM CLI supports both YAML and JSON; JSON is simpler to generate)
    await writeJSON(join(cwd, "template.json"), finalTemplate);

    success("AWS deployment configuration created");
  },
  deploy: ({ adapterOptions }) => {
    const stackName =
      adapterOptions?.stackName ?? adapterOptions?.name ?? "react-server-app";
    return {
      command: "sam",
      args: [
        "deploy",
        "--guided",
        "--stack-name",
        stackName,
        "--capabilities",
        "CAPABILITY_IAM",
        ...(adapterOptions?.deployArgs ?? []),
      ],
    };
  },
});

export default function defineConfig(adapterOptions) {
  return async (_, root, options) => adapter(adapterOptions, root, options);
}
