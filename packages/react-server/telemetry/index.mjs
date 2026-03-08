/**
 * User-facing telemetry API for @lazarv/react-server.
 *
 * Import from "@lazarv/react-server/telemetry" in your server components,
 * server functions, or middleware to access and extend telemetry.
 *
 * @module @lazarv/react-server/telemetry
 */

export {
  getSpan,
  getTracer,
  getMeter,
  getMetrics,
  withSpan,
  getOtelContext,
  injectTraceContext,
} from "../server/telemetry.mjs";
