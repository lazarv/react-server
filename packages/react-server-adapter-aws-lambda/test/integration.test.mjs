import { spawn } from "node:child_process";
import { rm } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

const TEST_DIR = dirname(fileURLToPath(import.meta.url));
const STREAMING_FIXTURE_DIR = join(TEST_DIR, "fixtures", "minimal-app");
const BUFFERED_FIXTURE_DIR = join(TEST_DIR, "fixtures", "minimal-app-buffered");
async function runPnpm(cwd, args) {
  await new Promise((resolve, reject) => {
    const child = spawn("pnpm", args, {
      cwd,
      stdio: "inherit",
      env: {
        ...process.env,
      },
    });

    child.on("error", reject);
    child.on("exit", (code) => {
      if (code === 0) {
        resolve();
      } else {
        reject(new Error(`pnpm ${args.join(" ")} exited with code ${code}`));
      }
    });
  });
}

async function installFixtureDependencies(cwd) {
  await runPnpm(cwd, ["install", "--ignore-scripts", "--no-lockfile"]);
}

async function buildFixture(cwd) {
  await runPnpm(cwd, ["react-server", "build"]);
}

function createStreamingLambdaMock() {
  const awslambda = {
    HttpResponseStream: {
      from() {
        throw new Error(
          "HttpResponseStream.from called before streamifyResponse setup"
        );
      },
    },
    streamifyResponse(handler) {
      return (event, context = {}) =>
        new Promise((resolve, reject) => {
          const state = {
            ended: false,
            isBase64Encoded: false,
            headers: {},
            statusCode: 200,
            cookies: undefined,
          };
          const chunks = [];

          const toBuffer = (chunk) => {
            if (chunk === undefined || chunk === null) {
              return;
            }
            if (typeof chunk === "string") {
              chunks.push(Buffer.from(chunk));
              return;
            }
            if (Buffer.isBuffer(chunk)) {
              chunks.push(chunk);
              return;
            }
            if (chunk instanceof Uint8Array) {
              chunks.push(Buffer.from(chunk));
              return;
            }
            chunks.push(Buffer.from(String(chunk)));
          };

          const finishResponse = () => {
            if (state.ended) {
              return;
            }
            state.ended = true;
            const bodyBuffer = Buffer.concat(chunks);
            const body = state.isBase64Encoded
              ? bodyBuffer.toString("base64")
              : bodyBuffer.toString("utf8");

            resolve({
              statusCode: state.statusCode,
              headers: state.headers,
              cookies: state.cookies,
              body,
              isBase64Encoded: state.isBase64Encoded,
            });
          };

          const response = {
            end(chunk) {
              if (chunk !== undefined) {
                toBuffer(chunk);
              }
              finishResponse();
            },
          };

          const responseStream = {
            write(chunk) {
              toBuffer(chunk);
              return true;
            },
            end(chunk) {
              if (chunk !== undefined) {
                toBuffer(chunk);
              }
              finishResponse();
            },
          };

          awslambda.HttpResponseStream = {
            from(_response, metadata = {}) {
              state.statusCode = metadata.statusCode ?? state.statusCode;
              state.headers = metadata.headers ?? {};
              state.cookies = metadata.cookies;
              state.isBase64Encoded = metadata.bodyEncoding === "base64";
              return responseStream;
            },
          };

          Promise.resolve(handler(event, response, context))
            .then(() => {
              if (!state.ended) {
                finishResponse();
              }
            })
            .catch((error) => {
              if (!state.ended) {
                state.ended = true;
                reject(error);
              }
            });
        });
    },
  };

  return awslambda;
}

function createHttpApiEvent(overrides = {}) {
  const baseEvent = {
    version: "2.0",
    routeKey: "$default",
    rawPath: "/",
    rawQueryString: "",
    cookies: [],
    headers: {
      accept: "text/html",
      host: "localhost",
      "user-agent": "vitest",
    },
    requestContext: {
      accountId: "test",
      apiId: "test",
      domainName: "localhost",
      domainPrefix: "test",
      http: {
        method: "GET",
        path: "/",
        protocol: "HTTP/1.1",
        sourceIp: "127.0.0.1",
        userAgent: "vitest",
      },
      requestId: "test",
      routeKey: "$default",
      stage: "$default",
      time: new Date().toISOString(),
      timeEpoch: Date.now(),
    },
    isBase64Encoded: false,
  };

  return {
    ...baseEvent,
    ...overrides,
    headers: {
      ...baseEvent.headers,
      ...overrides.headers,
    },
    requestContext: {
      ...baseEvent.requestContext,
      ...overrides.requestContext,
      http: {
        ...baseEvent.requestContext.http,
        ...overrides.requestContext?.http,
      },
    },
  };
}

function createLambdaContext(overrides = {}) {
  return {
    awsRequestId: "test",
    callbackWaitsForEmptyEventLoop: true,
    ...overrides,
  };
}

async function terminateReactServerWorker() {
  const { getRuntime } = await import(
    "@lazarv/react-server/server/runtime.mjs"
  );
  const { WORKER_THREAD } = await import(
    "@lazarv/react-server/server/symbols.mjs"
  );

  const worker = getRuntime(WORKER_THREAD);
  if (worker) {
    await worker.terminate();
  }
}

async function resetReactServerRenderer() {
  const { createRequire } = await import("node:module");
  const require = createRequire(import.meta.url);
  const React = require("react");
  const internals =
    React.__SERVER_INTERNALS_DO_NOT_USE_OR_WARN_USERS_THEY_CANNOT_UPGRADE;

  if (internals) {
    internals.A = null;
    internals.H = null;
  }
}

describe("AWS Lambda integration", () => {
  describe("streaming handler", () => {
    let originalCwd;
    let fixtureRoot;
    let handlerDirectory;
    let handlerModuleUrl;
    let originalAwsLambda;

    beforeAll(async () => {
      originalCwd = process.cwd();
      fixtureRoot = STREAMING_FIXTURE_DIR;
      process.chdir(fixtureRoot);

      await rm(join(fixtureRoot, "node_modules"), {
        recursive: true,
        force: true,
      });
      await rm(join(fixtureRoot, "pnpm-lock.yaml"), { force: true });
      await installFixtureDependencies(fixtureRoot);

      await rm(join(fixtureRoot, ".aws-lambda"), {
        recursive: true,
        force: true,
      });
      await rm(join(fixtureRoot, ".react-server"), {
        recursive: true,
        force: true,
      });

      await buildFixture(fixtureRoot);

      handlerDirectory = join(
        fixtureRoot,
        ".aws-lambda",
        "output",
        "functions",
        "index.func"
      );
      handlerModuleUrl = pathToFileURL(join(handlerDirectory, "index.mjs"));
      process.chdir(handlerDirectory);

      originalAwsLambda = globalThis.awslambda;
      globalThis.awslambda = createStreamingLambdaMock();
    }, 180_000);

    afterAll(async () => {
      await terminateReactServerWorker();
      await resetReactServerRenderer();

      if (originalAwsLambda) {
        globalThis.awslambda = originalAwsLambda;
      } else {
        delete globalThis.awslambda;
      }

      await rm(join(fixtureRoot, "node_modules"), {
        recursive: true,
        force: true,
      });
      await rm(join(fixtureRoot, "pnpm-lock.yaml"), { force: true });

      process.chdir(originalCwd);
    }, 30_000);

    it(
      "renders minimal React Server app through buffered handler",
      { isolate: true, timeout: 60_000 },
      async () => {
        process.env.ORIGIN = "https://integration.test";
        process.env.DEBUG_AWS_LAMBDA_ADAPTER = "0";

        vi.resetModules();
        process.chdir(handlerDirectory);
        const { handler } = await import(handlerModuleUrl.href);

        const event = createHttpApiEvent();
        const context = createLambdaContext();
        const response = await handler(event, context);

        expect(response.statusCode).toBe(200);
        const contentType =
          response.headers?.["content-type"] ??
          response.headers?.["Content-Type"];
        expect(contentType).toContain("text/html");

        const html = response.isBase64Encoded
          ? Buffer.from(response.body, "base64").toString("utf8")
          : response.body;

        expect(html).toContain("Minimal React Server App");

        delete process.env.ORIGIN;
        delete process.env.DEBUG_AWS_LAMBDA_ADAPTER;
      }
    );

    it(
      "reuses initialized streaming handler across multiple sequential invocations",
      { isolate: true, timeout: 120_000 },
      async () => {
        process.env.ORIGIN = "https://integration.test";
        process.env.DEBUG_AWS_LAMBDA_ADAPTER = "0";

        vi.resetModules();
        process.chdir(handlerDirectory);
        const { handler } = await import(handlerModuleUrl.href);

        for (let iteration = 0; iteration < 10; iteration += 1) {
          const event = createHttpApiEvent({
            rawQueryString: `iteration=${iteration}`,
            headers: {
              "x-test-iteration": String(iteration),
            },
            requestContext: {
              requestId: `test-${iteration}`,
              time: new Date().toISOString(),
              timeEpoch: Date.now(),
            },
          });

          const context = createLambdaContext({
            awsRequestId: `aws-test-${iteration}`,
          });

          const response = await handler(event, context);

          expect(response.statusCode).toBe(200);
          const contentType =
            response.headers?.["content-type"] ??
            response.headers?.["Content-Type"];
          expect(contentType).toContain("text/html");

          const html = response.isBase64Encoded
            ? Buffer.from(response.body, "base64").toString("utf8")
            : response.body;

          expect(html).toContain("Minimal React Server App");
        }

        delete process.env.ORIGIN;
        delete process.env.DEBUG_AWS_LAMBDA_ADAPTER;
      }
    );
  });

  describe("buffered handler", () => {
    let originalCwd;
    let fixtureRoot;
    let handlerDirectory;
    let handlerModuleUrl;

    beforeAll(async () => {
      originalCwd = process.cwd();
      fixtureRoot = BUFFERED_FIXTURE_DIR;
      process.chdir(fixtureRoot);

      await resetReactServerRenderer();

      await rm(join(fixtureRoot, "node_modules"), {
        recursive: true,
        force: true,
      });
      await rm(join(fixtureRoot, "pnpm-lock.yaml"), { force: true });
      await installFixtureDependencies(fixtureRoot);

      await rm(join(fixtureRoot, ".aws-lambda"), {
        recursive: true,
        force: true,
      });
      await rm(join(fixtureRoot, ".react-server"), {
        recursive: true,
        force: true,
      });

      await buildFixture(fixtureRoot);

      handlerDirectory = join(
        fixtureRoot,
        ".aws-lambda",
        "output",
        "functions",
        "index.func"
      );
      handlerModuleUrl = pathToFileURL(join(handlerDirectory, "index.mjs"));
      process.chdir(handlerDirectory);
    }, 180_000);

    afterAll(async () => {
      await terminateReactServerWorker();

      process.chdir(originalCwd);
      await rm(join(fixtureRoot, ".aws-lambda"), {
        recursive: true,
        force: true,
      });
      await rm(join(fixtureRoot, ".react-server"), {
        recursive: true,
        force: true,
      });
      await rm(join(fixtureRoot, "node_modules"), {
        recursive: true,
        force: true,
      });
      await rm(join(fixtureRoot, "pnpm-lock.yaml"), { force: true });
    }, 30_000);

    it(
      "renders minimal React Server app through buffered handler",
      { isolate: true, timeout: 60_000 },
      async () => {
        process.env.ORIGIN = "https://integration.test";
        process.env.DEBUG_AWS_LAMBDA_ADAPTER = "0";

        vi.resetModules();
        process.chdir(handlerDirectory);
        const { handler } = await import(handlerModuleUrl.href);

        const event = createHttpApiEvent();
        const context = createLambdaContext();
        const response = await handler(event, context);

        expect(response.statusCode).toBe(200);
        const contentType =
          response.headers?.["content-type"] ??
          response.headers?.["Content-Type"];
        expect(contentType).toContain("text/html");

        const html = response.isBase64Encoded
          ? Buffer.from(response.body, "base64").toString("utf8")
          : response.body;

        expect(html).toContain("Minimal React Server App");

        delete process.env.ORIGIN;
        delete process.env.DEBUG_AWS_LAMBDA_ADAPTER;
      }
    );

    it(
      "reuses initialized buffered handler across multiple sequential invocations",
      { isolate: true, timeout: 120_000 },
      async () => {
        process.env.ORIGIN = "https://integration.test";
        process.env.DEBUG_AWS_LAMBDA_ADAPTER = "0";

        vi.resetModules();
        process.chdir(handlerDirectory);
        const { handler } = await import(handlerModuleUrl.href);

        for (let iteration = 0; iteration < 10; iteration += 1) {
          const event = createHttpApiEvent({
            rawQueryString: `iteration=${iteration}`,
            headers: {
              "x-test-iteration": String(iteration),
            },
            requestContext: {
              requestId: `buffered-${iteration}`,
              time: new Date().toISOString(),
              timeEpoch: Date.now(),
            },
          });

          const context = createLambdaContext({
            awsRequestId: `aws-buffered-${iteration}`,
          });

          const response = await handler(event, context);

          expect(response.statusCode).toBe(200);
          const contentType =
            response.headers?.["content-type"] ??
            response.headers?.["Content-Type"];
          expect(contentType).toContain("text/html");

          const html = response.isBase64Encoded
            ? Buffer.from(response.body, "base64").toString("utf8")
            : response.body;

          expect(html).toContain("Minimal React Server App");
        }

        delete process.env.ORIGIN;
        delete process.env.DEBUG_AWS_LAMBDA_ADAPTER;
      }
    );
  });

  afterAll(async () => {
    await rm(join(STREAMING_FIXTURE_DIR, ".aws-lambda"), {
      recursive: true,
      force: true,
    });
    await rm(join(STREAMING_FIXTURE_DIR, ".react-server"), {
      recursive: true,
      force: true,
    });
  });
});
