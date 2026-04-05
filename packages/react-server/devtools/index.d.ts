/**
 * React Server DevTools configuration.
 *
 * Activated via:
 * - CLI: `react-server dev --devtools`
 * - Config: `{ devtools: true }` in react-server.config.mjs
 *
 * When active, the devtools panel is injected automatically —
 * no component import needed.
 */
export interface DevToolsConfig {
  /**
   * Position of the floating devtools button.
   * @default "bottom-right"
   */
  position?: "bottom-right" | "bottom-left" | "top-right" | "top-left";
}
