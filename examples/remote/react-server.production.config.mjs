export default {
  importMap: {
    imports: {
      react: "https://esm.sh/react@0.0.0-experimental-204a551e-20240926",
      "react/jsx-runtime":
        "https://esm.sh/react@0.0.0-experimental-204a551e-20240926/jsx-runtime",
      "react-dom":
        "https://esm.sh/react-dom@0.0.0-experimental-204a551e-20240926",
      "react-dom/client":
        "https://esm.sh/react-dom@0.0.0-experimental-204a551e-20240926/client",
      "react-server-dom-webpack/client.browser":
        "https://esm.sh/react-server-dom-webpack@0.0.0-experimental-204a551e-20240926/client.browser",
      "http://localhost:3003/client/node_modules/@lazarv/react-server/":
        "/client/node_modules/@lazarv/react-server/",
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
};
