// DevTools is now activated via the --devtools CLI flag or config.devtools.
// Host-page components (button, overlay, collector) are injected by render-rsc.jsx.
// Iframe routes (/__react_server_devtools__/*) are intercepted by ssr-handler.mjs.
//
// This module is kept as the package export entry point for the type definition.
export { default } from "./app/index.jsx";
