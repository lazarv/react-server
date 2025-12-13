export const REACT_RE = /\/react\/|\/react-dom\/|\/react-server-dom-webpack\//;

export const createTreeshake = (config) => ({
  moduleSideEffects: (id, external) => {
    if (REACT_RE.test(id)) {
      return true;
    }
    if (id.includes("/web-streams-polyfill/")) {
      return true;
    } else if (
      typeof config.build?.rollupOptions?.treeshake?.moduleSideEffects ===
      "function"
    ) {
      return config.build.rollupOptions.treeshake.moduleSideEffects(
        id,
        external
      );
    } else if (
      Array.isArray(config.build?.rollupOptions?.treeshake?.moduleSideEffects)
    ) {
      return config.build.rollupOptions.treeshake.moduleSideEffects.some(
        (pattern) =>
          (typeof pattern === "string" && id.includes(pattern)) ||
          (pattern instanceof RegExp && pattern.test(id))
      );
    } else if (
      config.build?.rollupOptions?.treeshake?.moduleSideEffects === true
    ) {
      return true;
    }
    return false;
  },
  ...config.build?.rollupOptions?.treeshake,
});
