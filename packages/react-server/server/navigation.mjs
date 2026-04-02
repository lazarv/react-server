// Server-safe navigation exports for the RSC environment.
// Re-exports everything from client/navigation.jsx (which become client
// references in RSC), but overrides createRoute with the server-safe version.
export * from "../client/navigation.jsx";
export { createRoute } from "./typed-route.jsx";
