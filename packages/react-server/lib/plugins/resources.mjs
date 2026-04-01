/**
 * Vite plugin providing the @lazarv/react-server/__resources__ virtual module.
 *
 * When the file-router is active, its prePlugin (enforce: "pre") overrides
 * this resolution with the actual resource descriptors. When the file-router
 * is NOT active, this plugin provides the empty fallback.
 */
export default function resources() {
  return {
    name: "react-server:resources",
    resolveId(id) {
      if (id === "@lazarv/react-server/__resources__") {
        return "virtual:@lazarv/react-server/__resources__";
      }
    },
    load(id) {
      if (id === "virtual:@lazarv/react-server/__resources__") {
        return "export default {};";
      }
    },
  };
}
