export type ReactServerConfig = any;
export function loadConfig<T extends Record<string, unknown>>(
  initialConfig: T
): Promise<ReactServerConfig>;
export function defineConfig<T extends Record<string, unknown>>(
  config: T
): ReactServerConfig;

export function forRoot(config?: ReactServerConfig): ReactServerConfig;
export function forChild(config?: ReactServerConfig): ReactServerConfig;
