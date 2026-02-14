import type { Adapter } from "@lazarv/react-server/adapters/core";

export { Adapter };

export type BuildOptions = {
  edge?: {
    entry: string;
  };
};

export let adapter: Adapter;

export let buildOptions: BuildOptions | undefined;

export default function defineConfig<T = any>(
  adapterOptions?: T
): (config: any, root: string, options: any) => Promise<void>;
