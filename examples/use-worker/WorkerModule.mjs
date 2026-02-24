export function getSystemInfo() {
  return {
    timestamp: new Date().toISOString(),
    platform: typeof process !== "undefined" ? process.platform : "browser",
    nodeVersion: typeof process !== "undefined" ? process.version : "N/A",
  };
}
