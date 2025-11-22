import {
  createDefaultLogger,
  ServerlessAdapter,
} from "@h4ad/serverless-adapter";
import { ApiGatewayV2Adapter } from "@h4ad/serverless-adapter/adapters/aws";
import { reactServer } from "@lazarv/react-server/node";

// Enable debug logging when DEBUG_AWS_LAMBDA_ADAPTER=1
// Use a constant that bundlers can dead-code eliminate
const DEBUG =
  process.env.DEBUG_AWS_LAMBDA_ADAPTER === "1" ||
  process.env.DEBUG_AWS_LAMBDA_ADAPTER === "2";

// When DEBUG is false, this creates a no-op function that bundlers will tree-shake
// along with all debug() call sites when minifying
export const debug = DEBUG
  ? console.log.bind(console, "[aws-lambda-adapter]")
  : /* @__PURE__ */ function noop() {};

if (DEBUG) {
  debug("Initializing AWS Lambda adapter", {
    DEBUG_AWS_LAMBDA_ADAPTER: process.env.DEBUG_AWS_LAMBDA_ADAPTER,
    ORIGIN: process.env.ORIGIN,
    NODE_ENV: process.env.NODE_ENV,
  });
}

// Boot the React Server node middlewares once (cold start init)
if (DEBUG) {
  debug(
    "Booting React Server with origin:",
    process.env.ORIGIN || "http://localhost:3000"
  );
}
const server = reactServer({
  origin: process.env.ORIGIN || "http://localhost:3000",
});

// change host header to match ORIGIN env var if set
// this fixes issues where POST request for RSC content returns links with incorrect host
let originHost = null;
if (process.env.ORIGIN) {
  const originEnv = process.env.ORIGIN;
  try {
    const { host } = new URL(originEnv);
    if (host) {
      originHost = host;
    }
  } catch {
    // Ignore invalid ORIGIN values; fall back to the original host header.
  }
}

// Memoize middlewares so we initialize once on cold start
let __middlewaresPromise;
export async function getMiddlewares() {
  if (!__middlewaresPromise) {
    __middlewaresPromise = server.then((s) => s.middlewares);
  }
  return __middlewaresPromise;
}

/**
 * Custom framework adapter for @lazarv/react-server that wraps the Node.js middleware
 * This allows @h4ad/serverless-adapter to work with react-server's middleware pattern
 */
export class ReactServerFramework {
  constructor(middlewares) {
    this.middlewares = middlewares;
  }

  getFrameworkName() {
    return "react-server";
  }

  /**
   * Forward the request to react-server middlewares and resolve when response completes
   * @param {null} _app - Not used, middlewares are passed via constructor
   * @param {import('http').IncomingMessage} request - Node.js IncomingMessage
   * @param {import('http').ServerResponse} response - Node.js ServerResponse
   */
  sendRequest(_app, request, response) {
    const requestId = DEBUG ? Math.random().toString(36).substring(7) : null;
    if (DEBUG) {
      debug(`[${requestId}] Processing request:`, {
        method: request.method,
        url: request.url,
        headers: Object.keys(request.headers),
      });
    }

    return new Promise((resolve, reject) => {
      // If ORIGIN is configured, enforce its host on the incoming request.
      // This ensures the app sees a stable Host header regardless of the
      // AWS entrypoint (Function URL, API Gateway, or CloudFront).
      if (originHost) {
        if (DEBUG) {
          debug(
            `[${requestId}] Overriding host header:`,
            request.headers.host,
            "->",
            originHost
          );
        }
        request.headers.host = originHost;
      }

      // fix requests with missing accept headers https://github.com/lazarv/react-server/issues/277
      if (!request.headers.accept) {
        if (DEBUG) {
          debug(`[${requestId}] Adding default accept header`);
        }
        request.headers.accept = "text/html";
      }

      const cleanup = [];
      const done = () => {
        if (DEBUG) {
          debug(`[${requestId}] Request completed`);
        }
        for (const [emitter, evt, fn] of cleanup) emitter.off(evt, fn);
        resolve();
      };
      const onError = (err) => {
        if (DEBUG) {
          debug(`[${requestId}] Request error:`, err.message);
        }
        for (const [emitter, evt, fn] of cleanup) emitter.off(evt, fn);
        reject(err);
      };

      const onFinish = () => {
        if (DEBUG) {
          debug(`[${requestId}] Response finished`);
        }
        done();
      };
      const onClose = () => {
        if (DEBUG) {
          debug(`[${requestId}] Response closed`);
        }
        done();
      };
      const onRespError = (e) => {
        if (DEBUG) {
          debug(`[${requestId}] Response error:`, e.message);
        }
        onError(e);
      };

      response.on("finish", onFinish);
      response.on("close", onClose);
      response.on("error", onRespError);
      cleanup.push([response, "finish", onFinish]);
      cleanup.push([response, "close", onClose]);
      cleanup.push([response, "error", onRespError]);

      try {
        if (DEBUG) {
          debug(`[${requestId}] Calling React Server middlewares`);
        }
        // Call react-server middlewares directly with Node's req/res
        this.middlewares(request, response);
      } catch (err) {
        if (DEBUG) {
          debug(`[${requestId}] Middleware error:`, err.message);
        }
        reject(err);
      }
    });
  }
}

/**
 * Create a memoized getAdapter() builder for the selected handler/resolver pair.
 * This ensures we only initialize once per cold start.
 */
export function createGetAdapter(HandlerCtor, ResolverCtor) {
  if (DEBUG) {
    debug("Creating adapter factory with:", {
      Handler: HandlerCtor.name,
      Resolver: ResolverCtor.name,
    });
  }

  let adapterPromise;
  return async function getAdapter() {
    if (!adapterPromise) {
      if (DEBUG) {
        debug("Building new adapter instance");
      }
      const middlewares = await getMiddlewares();
      if (DEBUG) {
        debug("Got middlewares, creating serverless adapter");
      }

      const logLevel =
        process.env.DEBUG_AWS_LAMBDA_ADAPTER === "2" ? "debug" : "warn";
      if (DEBUG) {
        debug("Setting log level to:", logLevel);
      }

      adapterPromise = ServerlessAdapter.new(null)
        .setFramework(new ReactServerFramework(middlewares))
        .setLogger(
          createDefaultLogger({
            level: logLevel,
          })
        )
        .setHandler(
          new HandlerCtor({
            callbackWaitsForEmptyEventLoop: false,
          })
        )
        .setResolver(new ResolverCtor())
        // API Gateway HTTP API (v2) support (also works for Function URLs)
        .addAdapter(new ApiGatewayV2Adapter())
        .build();

      if (DEBUG) {
        debug("Adapter built successfully");
      }
    } else {
      if (DEBUG) {
        debug("Reusing existing adapter instance");
      }
    }
    return adapterPromise;
  };
}

/**
 * Common handler runner for both streaming and buffered entries.
 * In both modes, the adapter is built with the appropriate Handler (AwsStreamHandler or DefaultHandler).
 * AwsStreamHandler internally wraps with awslambda.streamifyResponse(), so we always pass (event, context).
 */
export async function runHandler(event, context, getAdapter) {
  const requestId = DEBUG
    ? event?.requestContext?.requestId ||
      Math.random().toString(36).substring(7)
    : null;

  if (DEBUG) {
    debug(`[${requestId}] Handler invoked:`, {
      httpMethod: event?.httpMethod || event?.requestContext?.http?.method,
      path: event?.path || event?.rawPath,
      isBase64Encoded: event?.isBase64Encoded,
      hasBody: !!event?.body,
    });
  }

  if (context) {
    if (DEBUG) {
      debug(`[${requestId}] Setting callbackWaitsForEmptyEventLoop to false`);
    }
    context.callbackWaitsForEmptyEventLoop = false;
  }

  try {
    const adapter = await getAdapter();
    if (DEBUG) {
      debug(`[${requestId}] Executing adapter`);
    }
    const result = await adapter(event, context);
    if (DEBUG) {
      debug(`[${requestId}] Handler completed:`, {
        statusCode: result?.statusCode,
        hasBody: !!result?.body,
      });
    }
    return result;
  } catch (error) {
    if (DEBUG) {
      debug(`[${requestId}] Handler error:`, error.message);
    }
    throw error;
  }
}
