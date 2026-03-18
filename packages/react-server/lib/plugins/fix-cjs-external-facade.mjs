export default function fixCjsExternalFacade() {
  return {
    name: "react-server:fix-react-dom-cjs-facade",
    enforce: "pre",
    transform(code, id) {
      try {
        if (id.includes("vite_cjs-external-facade")) {
          return code.replace(
            "module.exports = { ...m }",
            "module.exports = m.default ?? m"
          );
        }
      } catch {
        // Ignore any errors during transformation to avoid breaking the build
      }
    },
  };
}
