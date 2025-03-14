export default {
  importMap: {
    imports: {
      react: "https://esm.sh/react@0.0.0-experimental-9ff42a87-20250130",
      "react/jsx-runtime":
        "https://esm.sh/react@0.0.0-experimental-9ff42a87-20250130/jsx-runtime",
      "react-dom":
        "https://esm.sh/react-dom@0.0.0-experimental-9ff42a87-20250130",
      "react-dom/client":
        "https://esm.sh/react-dom@0.0.0-experimental-9ff42a87-20250130/client",
      "react-server-dom-webpack/client.browser":
        "https://esm.sh/react-server-dom-webpack@0.0.0-experimental-9ff42a87-20250130/client.browser",
      "http://localhost:3003/client/__/__/packages/react-server/":
        "/client/__/__/packages/react-server/",
    },
  },
  resolve: {
    shared: [
      "react",
      "react/jsx-runtime",
      "react-dom",
      "react-dom/client",
      "react-server-dom-webpack/client.browser",
    ],
  },
  cors: true,
};
