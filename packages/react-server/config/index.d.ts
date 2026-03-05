import type { ReactServerConfig } from "./schema.js";

export type { ReactServerConfig } from "./schema.js";
export { DESCRIPTIONS, generateJsonSchema } from "./schema.js";

export function loadConfig(
  initialConfig: ReactServerConfig
): Promise<ReactServerConfig>;
export function defineConfig(config: ReactServerConfig): ReactServerConfig;

export function forRoot(config?: ReactServerConfig): ReactServerConfig;
export function forChild(config?: ReactServerConfig): ReactServerConfig;
