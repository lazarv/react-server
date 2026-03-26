import {
  getTracer,
  getOtelContext,
  makeSpanContext,
  isTracingEnabled,
} from "../../../server/telemetry.mjs";

// ── Human-readable middleware display names ──
const MIDDLEWARE_DISPLAY_NAMES = {
  devTooling: "Dev Tooling",
  basePathStrip: "Base Path",
  prerenderInit: "Prerender Init",
  serveStatic: "Static Files",
  trailingSlashRedirect: "Trailing Slash",
  notFound: "Not Found Handler",
  corsMiddleware: "CORS",
  cookieMiddleware: "Cookies",
  ssr: "SSR Handler",
  composed: "Middleware Chain",
};

function middlewareDisplayName(fn, index) {
  const raw = fn.name || `anonymous#${index}`;
  return MIDDLEWARE_DISPLAY_NAMES[raw] ?? raw;
}

export function compose(middlewares) {
  if (!Array.isArray(middlewares))
    throw new TypeError("middlewares must be an array");
  for (const mw of middlewares) {
    if (typeof mw !== "function")
      throw new TypeError("middleware must be function");
  }
  return function composed(context) {
    let index = -1;
    async function dispatch(i) {
      if (i === middlewares.length) return undefined;
      if (i < 0) i = 0;
      if (i <= index) throw new Error("next() called multiple times");
      index = i;
      const fn = middlewares[i];
      if (!fn) return undefined;
      context.next = () => dispatch(i + 1);

      // Fast path: skip all span machinery when telemetry is disabled
      if (!isTracingEnabled()) {
        const result = await fn(context);
        if (result === undefined) return context.next();
        return result;
      }

      // ── Telemetry: per-middleware span ──
      const tracer = getTracer();
      const parentCtx = context._otelCtx ?? getOtelContext();
      const displayName = middlewareDisplayName(fn, i);
      const span = tracer.startSpan(
        `Middleware: ${displayName}`,
        {
          attributes: {
            "react_server.middleware.index": i,
            "react_server.middleware.name": fn.name || `anonymous#${i}`,
            "react_server.middleware.display_name": displayName,
          },
        },
        parentCtx ?? undefined
      );
      // Propagate middleware span as parent context so inner spans
      // (e.g. RSC/SSR Render) nest under this middleware
      const prevOtelCtx = context._otelCtx;
      context._otelCtx = makeSpanContext(span, parentCtx);

      // Wrap next() so the current middleware span ends before dispatching
      // the next middleware. This ensures each span only measures its own work.
      const originalNext = context.next;
      let spanEnded = false;
      context.next = () => {
        if (!spanEnded) {
          span.end();
          spanEnded = true;
        }
        context._otelCtx = prevOtelCtx;
        return originalNext();
      };
      try {
        const result = await fn(context);
        // If middleware returned without calling next(), end span here
        if (!spanEnded) {
          span.end();
          spanEnded = true;
        }
        context._otelCtx = prevOtelCtx;
        if (result === undefined) return context.next();
        return result;
      } catch (error) {
        span.recordException(error);
        if (!spanEnded) {
          span.end();
          spanEnded = true;
        }
        context._otelCtx = prevOtelCtx;
        throw error;
      }
    }
    return dispatch(0);
  };
}
