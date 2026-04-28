import { version as fullVersion } from "@lazarv/react-server";

/**
 * The plain semver of the @lazarv/react-server package the docs site is
 * built against. The package's own `version` export is namespaced as
 * `react-server/<semver>` (handy for log lines), but every consumer that
 * advertises an MCP server / Agent Skill / API catalog wants just the
 * semver so external tools display it cleanly.
 */
export const version = fullVersion.split("/").pop() ?? fullVersion;
