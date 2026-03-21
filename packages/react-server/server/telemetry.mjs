/**
 * Core OpenTelemetry integration for @lazarv/react-server.
 *
 * This module provides:
 *  - SDK initialization (`initTelemetry`)
 *  - Helpers to create / retrieve spans from ContextStorage
 *  - Built-in metrics (request duration, active requests, render timings)
 *  - Trace-context propagation (W3C TraceContext)
 *
 * All OTel dependencies are loaded lazily so that the runtime has zero
 * overhead when telemetry is disabled (default in production unless configured).
 */

import { getContext, context$ } from "./context.mjs";
import { getRuntime, runtime$ } from "./runtime.mjs";
import {
  OTEL_API,
  OTEL_TRACER,
  OTEL_METER,
  OTEL_SPAN,
  OTEL_CONTEXT,
  OTEL_SDK,
  LOGGER_CONTEXT,
} from "./symbols.mjs";

// ─── Noop fallbacks ──────────────────────────────────────────────────────────

const NOOP_SPAN = {
  setAttribute() {
    return this;
  },
  setAttributes() {
    return this;
  },
  addEvent() {
    return this;
  },
  setStatus() {
    return this;
  },
  end() {},
  isRecording() {
    return false;
  },
  recordException() {},
  spanContext() {
    return { traceId: "", spanId: "", traceFlags: 0 };
  },
  updateName() {
    return this;
  },
};

const NOOP_TRACER = {
  startSpan() {
    return NOOP_SPAN;
  },
  startActiveSpan(_name, ...args) {
    const fn = args[args.length - 1];
    return fn(NOOP_SPAN);
  },
};

const NOOP_COUNTER = {
  add() {},
};
const NOOP_HISTOGRAM = {
  record() {},
};
const NOOP_UP_DOWN_COUNTER = {
  add() {},
};
const NOOP_METER = {
  createCounter() {
    return NOOP_COUNTER;
  },
  createHistogram() {
    return NOOP_HISTOGRAM;
  },
  createUpDownCounter() {
    return NOOP_UP_DOWN_COUNTER;
  },
  createObservableGauge() {
    return { addCallback() {} };
  },
};

// ─── Lazy OTel API access ────────────────────────────────────────────────────

let _api = null;

function getApi() {
  return _api ?? getRuntime(OTEL_API) ?? null;
}

async function otelApi() {
  if (!_api) {
    _api = await import("@opentelemetry/api");
  }
  return _api;
}

// ─── Public helpers ──────────────────────────────────────────────────────────

/**
 * Returns true when a real (non-noop) tracer has been configured.
 * Use this to skip span construction overhead on the hot path.
 */
export function isTracingEnabled() {
  return getRuntime(OTEL_TRACER) != null;
}

/**
 * Returns the active tracer (or a no-op tracer when telemetry is disabled).
 */
export function getTracer() {
  return getRuntime(OTEL_TRACER) ?? NOOP_TRACER;
}

/**
 * Returns the active meter (or a no-op meter when telemetry is disabled).
 */
export function getMeter() {
  return getRuntime(OTEL_METER) ?? NOOP_METER;
}

/**
 * Get the current request span from the per-request ContextStorage.
 * Returns a noop span when telemetry is off or called outside a request.
 */
export function getSpan() {
  return getContext(OTEL_SPAN) ?? NOOP_SPAN;
}

/**
 * Get the OTel context for the current request.
 */
export function getOtelContext() {
  return getContext(OTEL_CONTEXT) ?? null;
}

/**
 * Store a span (and optional OTel context) in the per-request ContextStorage.
 */
export function setSpan(span, otelCtx) {
  context$(OTEL_SPAN, span);
  if (otelCtx) {
    context$(OTEL_CONTEXT, otelCtx);
  }
}

/**
 * Create a new OTel context with the given span set as the active span.
 * Use this to propagate parent context so child spans are properly nested.
 *
 * This function is **synchronous** to avoid introducing async boundaries
 * in the render pipeline (which would break AsyncLocalStorage propagation
 * and cache behavior).  It relies on `_api` being populated eagerly by
 * `initTelemetry()` / `initEdgeTelemetry()` before any request is handled.
 */
export function makeSpanContext(span, parentCtx) {
  const api = getApi();
  if (!api || span === NOOP_SPAN) return undefined;
  return api.trace.setSpan(parentCtx || api.ROOT_CONTEXT, span);
}

/**
 * Execute `fn` within a child span of the current request span.
 *
 * @param {string} name - Span name
 * @param {Record<string,any>} [attributes] - Initial span attributes
 * @param {(span: any) => Promise<T>} fn - Function to execute inside the span
 * @returns {Promise<T>}
 *
 * @example
 * ```js
 * import { withSpan } from "@lazarv/react-server/telemetry";
 *
 * const result = await withSpan("db.query", { "db.system": "postgres" }, async (span) => {
 *   const rows = await db.query("SELECT ...");
 *   span.setAttribute("db.rows", rows.length);
 *   return rows;
 * });
 * ```
 */
export async function withSpan(name, attributes, fn) {
  if (typeof attributes === "function") {
    fn = attributes;
    attributes = {};
  }

  const tracer = getTracer();
  if (tracer === NOOP_TRACER) {
    return fn(NOOP_SPAN);
  }

  const parentOtelCtx = getOtelContext();
  const api = await otelApi();
  const ctx = parentOtelCtx ?? api.context.active();
  const span = tracer.startSpan(name, { attributes }, ctx);

  try {
    const result = await api.context.with(api.trace.setSpan(ctx, span), () =>
      fn(span)
    );
    span.setStatus({ code: api.SpanStatusCode.OK });
    return result;
  } catch (error) {
    span.setStatus({
      code: api.SpanStatusCode.ERROR,
      message: error?.message,
    });
    span.recordException(error);
    throw error;
  } finally {
    span.end();
  }
}

// ─── Built-in metrics ────────────────────────────────────────────────────────

let _metrics = null;

/**
 * Get (or lazily create) the built-in metrics instruments.
 */
export function getMetrics() {
  if (_metrics) return _metrics;
  const meter = getMeter();
  if (meter === NOOP_METER) return null;

  _metrics = {
    httpRequestDuration: meter.createHistogram("http.server.request.duration", {
      description: "Duration of HTTP requests",
      unit: "ms",
    }),
    httpActiveRequests: meter.createUpDownCounter(
      "http.server.active_requests",
      {
        description: "Number of active HTTP requests",
      }
    ),
    rscRenderDuration: meter.createHistogram(
      "react_server.rsc.render.duration",
      {
        description: "Duration of RSC rendering",
        unit: "ms",
      }
    ),
    domRenderDuration: meter.createHistogram(
      "react_server.dom.render.duration",
      {
        description: "Duration of SSR DOM rendering",
        unit: "ms",
      }
    ),
    actionDuration: meter.createHistogram(
      "react_server.server_function.duration",
      {
        description: "Duration of server function execution",
        unit: "ms",
      }
    ),
    cacheHits: meter.createCounter("react_server.cache.hits", {
      description: "Number of cache hits",
    }),
    cacheMisses: meter.createCounter("react_server.cache.misses", {
      description: "Number of cache misses",
    }),
  };
  return _metrics;
}

// ─── SDK Initialization ──────────────────────────────────────────────────────

/**
 * Resolve the telemetry config. Returns null when telemetry should be disabled.
 *
 * Telemetry is enabled when:
 *  1. `config.telemetry.enabled` is explicitly `true`, OR
 *  2. The `OTEL_EXPORTER_OTLP_ENDPOINT` env var is set, OR
 *  3. The `REACT_SERVER_TELEMETRY` env var is "true"
 */
export function resolveTelemetryConfig(config) {
  const env = typeof process !== "undefined" ? process.env : {};
  const telemetryConfig = config?.telemetry ?? {};

  // Explicit opt-out via env var (e.g. set in test runner config)
  if (env.REACT_SERVER_TELEMETRY === "false") {
    return null;
  }

  const enabled =
    telemetryConfig.enabled === true ||
    !!env.OTEL_EXPORTER_OTLP_ENDPOINT ||
    env.REACT_SERVER_TELEMETRY === "true";

  if (!enabled) return null;

  const isDev = env.NODE_ENV === "development" || env.NODE_ENV === undefined;

  return {
    serviceName:
      telemetryConfig.serviceName ??
      env.OTEL_SERVICE_NAME ??
      config?.name ??
      "@lazarv/react-server",
    endpoint:
      telemetryConfig.endpoint ??
      env.OTEL_EXPORTER_OTLP_ENDPOINT ??
      "http://localhost:4318",
    exporter:
      telemetryConfig.exporter ??
      (env.OTEL_EXPORTER_OTLP_ENDPOINT
        ? "otlp"
        : isDev
          ? "dev-console"
          : "otlp"),
    sampleRate: telemetryConfig.sampleRate ?? 1.0,
    propagators: telemetryConfig.propagators ?? ["w3c"],
    metrics: {
      enabled: telemetryConfig.metrics?.enabled !== false,
      interval: telemetryConfig.metrics?.interval ?? 30000,
    },
  };
}

/**
 * Initialize the OpenTelemetry SDK for Node.js runtime.
 * Stores the tracer and meter in RuntimeContextStorage.
 *
 * @param {object} telemetryConfig - Resolved config from `resolveTelemetryConfig()`
 * @returns {Promise<object|null>} The SDK instance, or null if not initialized
 */
export async function initTelemetry(telemetryConfig) {
  if (!telemetryConfig) return null;

  const logger = getRuntime(LOGGER_CONTEXT);
  const isDevConsole =
    telemetryConfig.exporter === "dev-console" ||
    telemetryConfig.exporter === "console";

  try {
    // For dev-console / console exporters, use BasicTracerProvider with
    // SimpleSpanProcessor so spans are exported immediately (not batched).
    // This avoids importing OTLP exporters that try to connect to a collector.
    if (isDevConsole) {
      const [
        api,
        { BasicTracerProvider, SimpleSpanProcessor, ConsoleSpanExporter },
        { resourceFromAttributes },
        { ATTR_SERVICE_NAME },
      ] = await Promise.all([
        import("@opentelemetry/api"),
        import("@opentelemetry/sdk-trace-base"),
        import("@opentelemetry/resources"),
        import("@opentelemetry/semantic-conventions"),
      ]);

      // Cache the API module so synchronous helpers (makeSpanContext) work
      _api = api;
      runtime$(OTEL_API, api);

      const resource = resourceFromAttributes({
        [ATTR_SERVICE_NAME]: telemetryConfig.serviceName,
        "react_server.runtime": "node",
      });

      let exporter;
      if (telemetryConfig.exporter === "dev-console") {
        const { DevConsoleSpanExporter } =
          await import("./dev-trace-exporter.mjs");
        exporter = new DevConsoleSpanExporter();
      } else {
        exporter = new ConsoleSpanExporter();
      }

      const provider = new BasicTracerProvider({
        resource,
        spanProcessors: [new SimpleSpanProcessor(exporter)],
      });
      api.trace.setGlobalTracerProvider(provider);

      const tracer = api.trace.getTracer("@lazarv/react-server", "0.0.0");

      runtime$(OTEL_TRACER, tracer);
      runtime$(OTEL_SDK, provider);

      const log = logger?.info?.bind(logger) ?? console.log;
      log("[telemetry] OpenTelemetry initialized");
      log(
        `[telemetry] service=${telemetryConfig.serviceName} exporter=${telemetryConfig.exporter}`
      );

      return provider;
    }

    // For OTLP exporter, use the full NodeSDK with batch processing.
    const [
      { NodeSDK },
      { OTLPTraceExporter },
      { OTLPMetricExporter },
      { PeriodicExportingMetricReader },
      api,
      { W3CTraceContextPropagator },
    ] = await Promise.all([
      import("@opentelemetry/sdk-node"),
      import("@opentelemetry/exporter-trace-otlp-http"),
      import("@opentelemetry/exporter-metrics-otlp-http"),
      import("@opentelemetry/sdk-metrics"),
      import("@opentelemetry/api"),
      import("@opentelemetry/core"),
    ]);

    // Cache the API module so synchronous helpers (makeSpanContext) work
    _api = api;
    runtime$(OTEL_API, api);

    // Use NodeSDK's built-in serviceName option instead of creating a custom
    // resource. This avoids cross-version Resource class incompatibilities
    // that can arise when pnpm hoists different @opentelemetry/resources
    // versions for the user project vs sdk-node's own dependency.
    // Additional resource attributes are set via OTEL_RESOURCE_ATTRIBUTES.
    process.env.OTEL_RESOURCE_ATTRIBUTES = [
      process.env.OTEL_RESOURCE_ATTRIBUTES,
      "react_server.runtime=node",
    ]
      .filter(Boolean)
      .join(",");

    const traceExporter = new OTLPTraceExporter({
      url: `${telemetryConfig.endpoint}/v1/traces`,
    });

    const sdkConfig = {
      serviceName: telemetryConfig.serviceName,
      traceExporter,
      textMapPropagator: new W3CTraceContextPropagator(),
    };

    if (telemetryConfig.metrics.enabled) {
      sdkConfig.metricReader = new PeriodicExportingMetricReader({
        exporter: new OTLPMetricExporter({
          url: `${telemetryConfig.endpoint}/v1/metrics`,
        }),
        exportIntervalMillis: telemetryConfig.metrics.interval,
      });
    }

    const sdk = new NodeSDK(sdkConfig);
    sdk.start();

    const tracer = api.trace.getTracer("@lazarv/react-server", "0.0.0");
    const meter = api.metrics.getMeter("@lazarv/react-server", "0.0.0");

    runtime$(OTEL_TRACER, tracer);
    runtime$(OTEL_METER, meter);
    runtime$(OTEL_SDK, sdk);

    const log = logger?.info?.bind(logger) ?? console.log;
    log("[telemetry] OpenTelemetry initialized");
    log(
      `[telemetry] service=${telemetryConfig.serviceName} exporter=${telemetryConfig.exporter} endpoint=${telemetryConfig.endpoint}`
    );

    return sdk;
  } catch (error) {
    const msg =
      `[telemetry] Failed to initialize OpenTelemetry: ${error.message}. ` +
      "Install @opentelemetry/sdk-node and related packages to enable telemetry.";
    if (logger?.warn) {
      logger.warn(msg);
    } else {
      console.warn(msg);
    }
    return null;
  }
}

/**
 * Initialize lightweight telemetry for edge runtimes.
 * Uses only @opentelemetry/api with a simple span processor.
 *
 * @param {object} telemetryConfig - Resolved config from `resolveTelemetryConfig()`
 * @returns {Promise<object|null>}
 */
export async function initEdgeTelemetry(telemetryConfig) {
  if (!telemetryConfig) return null;

  try {
    const [
      api,
      { BasicTracerProvider, SimpleSpanProcessor },
      { resourceFromAttributes },
      { ATTR_SERVICE_NAME },
    ] = await Promise.all([
      import("@opentelemetry/api"),
      import("@opentelemetry/sdk-trace-base"),
      import("@opentelemetry/resources"),
      import("@opentelemetry/semantic-conventions"),
    ]);

    // Cache the API module so synchronous helpers (makeSpanContext) work
    _api = api;
    runtime$(OTEL_API, api);

    const resource = resourceFromAttributes({
      [ATTR_SERVICE_NAME]: telemetryConfig.serviceName,
      "react_server.runtime": "edge",
    });

    let spanProcessor;

    // Try to use OTLP fetch-based exporter for edge
    try {
      const { OTLPTraceExporter } =
        await import("@opentelemetry/exporter-trace-otlp-http");
      spanProcessor = new SimpleSpanProcessor(
        new OTLPTraceExporter({
          url: `${telemetryConfig.endpoint}/v1/traces`,
        })
      );
    } catch {
      // If no OTLP exporter, use console
      const { ConsoleSpanExporter } =
        await import("@opentelemetry/sdk-trace-base");
      spanProcessor = new SimpleSpanProcessor(new ConsoleSpanExporter());
    }

    const provider = new BasicTracerProvider({
      resource,
      spanProcessors: [spanProcessor],
    });
    api.trace.setGlobalTracerProvider(provider);

    const tracer = api.trace.getTracer("@lazarv/react-server", "0.0.0");

    runtime$(OTEL_TRACER, tracer);
    // No meter for edge — metrics not supported in edge runtimes
    runtime$(OTEL_SDK, provider);

    return provider;
  } catch {
    return null;
  }
}

/**
 * Gracefully shut down the SDK (flush pending spans/metrics).
 */
export async function shutdownTelemetry() {
  const sdk = getRuntime(OTEL_SDK);
  if (sdk?.shutdown) {
    await sdk.shutdown();
  }
}

// ─── Trace-context propagation ───────────────────────────────────────────────

/**
 * Extract W3C trace context from incoming request headers and create a root
 * span. Returns { span, otelCtx } for the request.
 *
 * @param {string} spanName - Name for the root span
 * @param {Headers|object} headers - Incoming request headers
 * @param {Record<string,any>} [attributes] - Initial span attributes
 * @returns {Promise<{ span: any, otelCtx: any }>}
 */
export async function startRequestSpan(spanName, headers, attributes = {}) {
  const tracer = getTracer();
  if (tracer === NOOP_TRACER) {
    return { span: NOOP_SPAN, otelCtx: null };
  }

  const api = await otelApi();

  // Build a carrier object from Headers
  const carrier = {};
  if (headers && typeof headers.forEach === "function") {
    headers.forEach((value, key) => {
      carrier[key] = value;
    });
  } else if (headers && typeof headers === "object") {
    for (const [key, value] of Object.entries(headers)) {
      carrier[key] = Array.isArray(value) ? value[0] : value;
    }
  }

  const extractedCtx = api.propagation.extract(api.ROOT_CONTEXT, carrier);

  const span = tracer.startSpan(spanName, { attributes }, extractedCtx);
  const otelCtx = api.trace.setSpan(extractedCtx, span);

  return { span, otelCtx };
}

/**
 * Inject trace context into outgoing response headers.
 *
 * @param {Headers} headers - Outgoing response headers
 */
export async function injectTraceContext(headers) {
  const otelCtx = getOtelContext();
  if (!otelCtx) return;

  try {
    const api = await otelApi();
    const carrier = {};
    api.propagation.inject(otelCtx, carrier);
    for (const [key, value] of Object.entries(carrier)) {
      headers.set(key, value);
    }
  } catch {
    // no-op if propagation fails
  }
}
