export default {
  importMap: {
    imports: {
      ...(process.env.NODE_ENV !== "production"
        ? {
            react:
              "https://esm.sh/react@0.0.0-experimental-58af67a8f8-20240628?dev",
            "react/jsx-dev-runtime":
              "https://esm.sh/react@0.0.0-experimental-58af67a8f8-20240628/jsx-dev-runtime?dev",
            "react-dom":
              "https://esm.sh/react-dom@0.0.0-experimental-58af67a8f8-20240628?dev",
            "react-dom/client":
              "https://esm.sh/react-dom@0.0.0-experimental-58af67a8f8-20240628/client?dev",
            "react-server-dom-webpack/client.browser":
              "https://esm.sh/react-server-dom-webpack@0.0.0-experimental-58af67a8f8-20240628/client.browser?dev",
            "http://[::1]:3001/": "/",
            "http://localhost:3003/": "/",
          }
        : {
            react:
              "https://esm.sh/react@0.0.0-experimental-58af67a8f8-20240628",
            "react/jsx-runtime":
              "https://esm.sh/react@0.0.0-experimental-58af67a8f8-20240628/jsx-runtime",
            "react-dom":
              "https://esm.sh/react-dom@0.0.0-experimental-58af67a8f8-20240628",
            "react-dom/client":
              "https://esm.sh/react-dom@0.0.0-experimental-58af67a8f8-20240628/client",
            "react-server-dom-webpack/client.browser":
              "https://esm.sh/react-server-dom-webpack@0.0.0-experimental-58af67a8f8-20240628/client.browser",
            "http://localhost:3003/client/node_modules/@lazarv/react-server/":
              "/client/node_modules/@lazarv/react-server/",
          }),
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
  export() {
    return [
      {
        path: "/",
        remote: true,
      },
    ];
  },
};
