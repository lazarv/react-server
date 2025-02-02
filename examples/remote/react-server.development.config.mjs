export default {
  importMap: {
    imports: {
      react: "https://esm.sh/react@0.0.0-experimental-9ff42a87-20250130?dev",
      "react/jsx-dev-runtime":
        "https://esm.sh/react@0.0.0-experimental-9ff42a87-20250130/jsx-dev-runtime?dev",
      "react/jsx-runtime":
        "https://esm.sh/react@0.0.0-experimental-9ff42a87-20250130/jsx-runtime?dev",
      "react-dom":
        "https://esm.sh/react-dom@0.0.0-experimental-9ff42a87-20250130?dev",
      "react-dom/client":
        "https://esm.sh/react-dom@0.0.0-experimental-9ff42a87-20250130/client?dev",
      "react-server-dom-webpack/client.browser":
        "https://esm.sh/react-server-dom-webpack@0.0.0-experimental-9ff42a87-20250130/client.browser?dev",
      "http://[::1]:3001/": "/",
      "http://localhost:3003/": "/",
    },
  },
  resolve: {
    shared: [
      "react",
      "react/jsx-dev-runtime",
      "react/jsx-runtime",
      "react-dom",
      "react-dom/client",
      "react-server-dom-webpack/client.browser",
    ],
  },
};
