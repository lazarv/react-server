export default function fixEsbuildOptionsPlugin() {
  return {
    name: "react-server:fix-esbuildoptions",
    enforce: "pre",
    config(config) {
      if (config.optimizeDeps?.esbuildOptions) {
        delete config.optimizeDeps.esbuildOptions;
      }
      return config;
    },
  };
}
