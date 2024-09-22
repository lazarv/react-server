declare module "@lazarv/react-server-adapter-core" {
  export interface Adapter<T = any> {
    (adapterOptions: T, root: string, options: any): Promise<void>;
  }

  export function createAdapter<T = any>(options: {
    name: string;
    outDir: string;
    outStaticDir?: string;
    handler: (options: {
      adapterOptions: T;
      files: {
        static: () => Promise<string[]>;
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
        static: (out: string) => Promise<void>;
        assets: (out: string) => Promise<void>;
        client: (out: string) => Promise<void>;
        public: (out: string) => Promise<void>;
        server: (out: string) => Promise<void>;
        dependencies: (out: string, adapterFiles: string[]) => Promise<void>;
      };
      config: Record<string, any>;
      reactServerDir: string;
      reactServerOutDir: string;
      root: string;
      options: any;
    }) => Promise<void>;
  }): Adapter<T>;

  export function banner(message: string): void;
  export function clearDirectory(dir: string): Promise<void>;
  export function copy(src: string, dest: string): Promise<void>;
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
    reactServerOutDir: string
  ): Promise<void>;
  export function message(primary: string, secondary?: string): void;
  export function success(message: string): void;
  export function writeJSON(
    path: string,
    data: Record<string, any>
  ): Promise<void>;
  export function clearProgress(): void;
  export function createProgress(
    message: string,
    total: number,
    start?: number
  ): void;
  export function progress(options: {
    message: string;
    files: string[];
    onProgress: (file: string) => Promise<void>;
    onFile: (file: string) => Promise<void>;
  }): Promise<void>;
  export function getConfig(): Record<string, any>;
  export function getPublicDir(): string;
  export function getFiles(pattern: string, srcDir?: string): Promise<string[]>;
  export function getDependencies(
    adapterFiles: string[],
    reactServerDir: string
  ): Promise<string[]>;
  export function spawnCommand(command: string, args: string[]): Promise<void>;
}
