declare module "@lazarv/react-server/adapters/core" {
  export interface Adapter<T = any> {
    (adapterOptions: T, root: string, options: any): Promise<void>;
  }

  export type DeployCommandDescriptor = {
    command: string;
    args: string[];
    message?: string;
  };

  export function createAdapter<T = any, R = void>(options: {
    name: string;
    outDir: string;
    outStaticDir?: string;
    outServerDir?: string;
    handler: (options: {
      adapterOptions: T;
      files: {
        static: () => Promise<string[]>;
        compressed: () => Promise<string[]>;
        assets: () => Promise<string[]>;
        client: () => Promise<string[]>;
        public: () => Promise<string[]>;
        server: () => Promise<string[]>;
        dependencies: (
          adapterFiles: string[]
        ) => Promise<{ src: string; dest: string }[]>;
        all: () => Promise<string[]>;
      };
      copy: {
        static: (out?: string) => Promise<void>;
        compressed: (out?: string) => Promise<void>;
        assets: (out?: string) => Promise<void>;
        client: (out?: string) => Promise<void>;
        public: (out?: string) => Promise<void>;
        server: (out?: string) => Promise<void>;
        dependencies: (out: string, adapterFiles?: string[]) => Promise<void>;
      };
      config: Record<string, any>;
      reactServerDir: string;
      reactServerOutDir: string;
      root: string;
      options: Record<string, any>;
    }) => Promise<R>;
    deploy?:
      | DeployCommandDescriptor
      | ((context: {
          adapterOptions: T;
          options: Record<string, any>;
          handlerResult: R;
        }) =>
          | DeployCommandDescriptor
          | Promise<DeployCommandDescriptor>
          | void
          | Promise<void>);
  }): Adapter<T>;

  export function banner(
    message: string,
    options?: { forceVerbose?: boolean; emoji?: string }
  ): void;
  export function clearDirectory(dir: string): Promise<void>;
  export function copy(
    srcDir: string,
    destDir: string,
    reactServerOutDir: string
  ): (file: string) => Promise<void>;
  export function copyMessage(
    file: string,
    srcDir: string,
    destDir: string,
    reactServerOutDir: string
  ): void;
  export function copyFiles(
    message: string,
    files: string[],
    srcDir: string,
    destDir: string,
    reactServerOutDir: string,
    emoji?: string
  ): Promise<void>;
  export function message(primary: string, secondary?: string): void;
  export function success(message: string): void;
  export function writeJSON(
    path: string,
    data: Record<string, any>
  ): Promise<void>;
  export function clearProgress(): void;
  export function getConfig(): Record<string, any>;
  export function getPublicDir(): string;
  export function getFiles(
    pattern: string | string[],
    srcDir?: string
  ): Promise<string[]>;
  export function getDependencies(
    adapterFiles: string[],
    reactServerDir: string
  ): Promise<{ src: string; dest: string }[]>;
  export function spawnCommand(command: string, args: string[]): Promise<void>;
  export function deepMerge<T extends Record<string, any>>(
    source: T,
    target: Partial<T>
  ): T;
  export function readToml<T = Record<string, any>>(filePath: string): T | null;
  export function writeToml(
    filePath: string,
    data: Record<string, any>
  ): Promise<void>;
  export function mergeTomlConfig<T = Record<string, any>>(
    existingPath: string,
    adapterConfig: Partial<T>
  ): T;
}
