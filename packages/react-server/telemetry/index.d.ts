/**
 * Telemetry API for `@lazarv/react-server`.
 *
 * All functions are safe to call even when OpenTelemetry is not installed —
 * they return no-op objects that silently discard data.
 *
 * @module @lazarv/react-server/telemetry
 */

/** Minimal Span interface compatible with @opentelemetry/api Span. */
export interface Span {
  setAttribute(key: string, value: unknown): Span;
  setAttributes(attributes: Record<string, unknown>): Span;
  addEvent(name: string, attributes?: Record<string, unknown>): Span;
  setStatus(status: { code: number; message?: string }): Span;
  recordException(exception: unknown): void;
  end(): void;
  isRecording(): boolean;
  spanContext(): { traceId: string; spanId: string; traceFlags: number };
  updateName(name: string): Span;
}

/** Minimal Tracer interface compatible with @opentelemetry/api Tracer. */
export interface Tracer {
  startSpan(name: string, options?: unknown, context?: unknown): Span;
  startActiveSpan<F extends (span: Span) => unknown>(
    name: string,
    fn: F
  ): ReturnType<F>;
}

/** Minimal Meter interface compatible with @opentelemetry/api Meter. */
export interface Meter {
  createCounter(
    name: string,
    options?: unknown
  ): { add(value: number, attributes?: Record<string, unknown>): void };
  createHistogram(
    name: string,
    options?: unknown
  ): { record(value: number, attributes?: Record<string, unknown>): void };
  createUpDownCounter(
    name: string,
    options?: unknown
  ): { add(value: number, attributes?: Record<string, unknown>): void };
}

/** OTel context — opaque type. */
export type Context = unknown;

/**
 * Get the current request span from the per-request context.
 * Returns a no-op span when telemetry is disabled or called outside a request.
 */
export function getSpan(): Span;

/**
 * Get the active OpenTelemetry tracer.
 * Returns a no-op tracer when telemetry is disabled.
 */
export function getTracer(): Tracer;

/**
 * Get the active OpenTelemetry meter.
 * Returns a no-op meter when telemetry is disabled.
 */
export function getMeter(): Meter;

/**
 * Get the OTel context for the current request.
 */
export function getOtelContext(): Context | null;

/**
 * Execute `fn` within a child span of the current request span.
 *
 * @param name - Span name
 * @param fn - Function to execute inside the span
 * @returns The return value of `fn`
 *
 * @example
 * ```ts
 * import { withSpan } from "@lazarv/react-server/telemetry";
 *
 * const result = await withSpan("db.query", async (span) => {
 *   span.setAttribute("db.system", "postgres");
 *   return await db.query("SELECT ...");
 * });
 * ```
 */
export function withSpan<T>(
  name: string,
  fn: (span: Span) => Promise<T> | T
): Promise<T>;

/**
 * Execute `fn` within a child span with initial attributes.
 *
 * @param name - Span name
 * @param attributes - Initial span attributes
 * @param fn - Function to execute inside the span
 * @returns The return value of `fn`
 *
 * @example
 * ```ts
 * import { withSpan } from "@lazarv/react-server/telemetry";
 *
 * const result = await withSpan(
 *   "external.api",
 *   { "http.url": "https://api.example.com" },
 *   async (span) => {
 *     const res = await fetch("https://api.example.com/data");
 *     span.setAttribute("http.status_code", res.status);
 *     return res.json();
 *   }
 * );
 * ```
 */
export function withSpan<T>(
  name: string,
  attributes: Record<string, string | number | boolean>,
  fn: (span: Span) => Promise<T> | T
): Promise<T>;

/**
 * Inject W3C trace context into outgoing response headers.
 * Useful when making downstream HTTP calls that should be correlated.
 */
export function injectTraceContext(headers: Headers): Promise<void>;

/**
 * Built-in metrics instruments. Returns `null` when telemetry is disabled.
 */
export function getMetrics(): {
  httpRequestDuration: {
    record(value: number, attributes?: Record<string, string | number>): void;
  };
  httpActiveRequests: {
    add(value: number, attributes?: Record<string, string | number>): void;
  };
  rscRenderDuration: {
    record(value: number, attributes?: Record<string, string | number>): void;
  };
  domRenderDuration: {
    record(value: number, attributes?: Record<string, string | number>): void;
  };
  actionDuration: {
    record(value: number, attributes?: Record<string, string | number>): void;
  };
  cacheHits: {
    add(value: number, attributes?: Record<string, string | number>): void;
  };
  cacheMisses: {
    add(value: number, attributes?: Record<string, string | number>): void;
  };
} | null;
