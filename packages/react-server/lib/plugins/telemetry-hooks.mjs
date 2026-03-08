/**
 * Vite plugin that instruments all other plugins' hooks with OpenTelemetry spans.
 *
 * When telemetry is enabled, this plugin wraps the `resolveId`, `load`,
 * `transform`, `buildStart`, `buildEnd`, `configResolved`, `configureServer`,
 * and `handleHotUpdate` hooks on every plugin so each invocation is individually
 * traced.
 *
 * This gives full visibility into how long each Vite plugin hook takes — even
 * built-in plugins.
 */

const TRACED_HOOKS = [
  "resolveId",
  "load",
  "transform",
  "buildStart",
  "buildEnd",
  "handleHotUpdate",
];

/**
 * Wraps a single hook function to emit an OTel span on each call.
 */
function wrapHook(
  hookName,
  pluginName,
  originalHook,
  getTracer,
  getOtelContext
) {
  // Hooks can be either a function or an object { handler, order, ... }
  if (
    typeof originalHook === "object" &&
    originalHook !== null &&
    originalHook.handler
  ) {
    return {
      ...originalHook,
      handler: wrapHookFn(
        hookName,
        pluginName,
        originalHook.handler,
        getTracer,
        getOtelContext
      ),
    };
  }
  if (typeof originalHook === "function") {
    return wrapHookFn(
      hookName,
      pluginName,
      originalHook,
      getTracer,
      getOtelContext
    );
  }
  return originalHook;
}

function wrapHookFn(hookName, pluginName, fn, getTracer, getOtelContext) {
  const wrapped = async function (...args) {
    const tracer = getTracer();
    // Check if it's the noop tracer (has no actual recording)
    if (!tracer || !tracer.startSpan) return fn.apply(this, args);

    const parentCtx = getOtelContext?.() ?? undefined;
    const span = tracer.startSpan(
      `Vite plugin [${pluginName}].${hookName}: `,
      {
        attributes: {
          "react_server.vite.plugin": pluginName,
          "react_server.vite.hook": hookName,
          ...(hookName === "resolveId" && args[0]
            ? { "react_server.vite.module_id": String(args[0]).slice(0, 200) }
            : {}),
          ...(hookName === "load" && args[0]
            ? { "react_server.vite.module_id": String(args[0]).slice(0, 200) }
            : {}),
          ...(hookName === "transform" && args[1]
            ? { "react_server.vite.module_id": String(args[1]).slice(0, 200) }
            : {}),
        },
      },
      parentCtx
    );

    try {
      const result = await fn.apply(this, args);
      span.end();
      return result;
    } catch (error) {
      span.setStatus({ code: 2, message: error?.message });
      span.recordException(error);
      span.end();
      throw error;
    }
  };

  // Preserve function name for debugging
  Object.defineProperty(wrapped, "name", { value: fn.name || hookName });
  return wrapped;
}

/**
 * Creates a Vite plugin that instruments all other plugins' hooks.
 *
 * Must be added as the LAST plugin so that `configResolved` sees all plugins.
 * Only added when telemetry is enabled (tracer already initialized).
 */
export default function telemetryHooks() {
  let telemetryMod = null;
  const telemetryReady = import("../../server/telemetry.mjs").then((mod) => {
    telemetryMod = mod;
  });

  return {
    name: "react-server:telemetry-hooks",
    enforce: "pre",
    async configResolved(resolvedConfig) {
      // Wait for the telemetry module to be loaded
      await telemetryReady;
      if (!telemetryMod) return;

      const { getTracer, getOtelContext } = telemetryMod;

      // Wrap hooks on all other plugins
      for (const plugin of resolvedConfig.plugins) {
        if (plugin.name === "react-server:telemetry-hooks") continue;

        for (const hookName of TRACED_HOOKS) {
          if (plugin[hookName]) {
            plugin[hookName] = wrapHook(
              hookName,
              plugin.name,
              plugin[hookName],
              getTracer,
              getOtelContext
            );
          }
        }
      }
    },
  };
}
