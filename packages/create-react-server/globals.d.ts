interface VitePlugin {
  (): {
    name: string;
  };
}

declare module "vite" {
  export interface UserConfig {
    resolve?: {
      alias?: Record<string, string>;
    };
    plugins?: VitePlugin[];
    css?: {
      transformer?: string;
      lightningcss?: {
        targets?: Record<string, string>;
      };
    };
    build?: {
      cssMinify?: string;
    };
  }
  export function defineConfig(config: UserConfig): UserConfig;
}

declare namespace global {
  interface ImportMeta {
    readonly url: URL;
  }
}

declare module "@vitejs/plugin-react" {
  export default function reactPlugin(options: {
    babel?: {
      plugins: [
        [
          "babel-plugin-react-compiler",
          {
            compilationMode: "annotation";
          },
        ],
      ];
    };
  }): VitePlugin;
}

declare module "@vitejs/plugin-react-swc" {
  export default function reactSwcPlugin(): VitePlugin;
}

declare module "browserslist" {
  export default function browserslist(query: string): string[];
}

declare module "lightningcss" {
  export function browserslistToTargets(
    browsers: string[]
  ): Record<string, string>;
}

declare module "@tailwindcss/vite" {
  export default function tailwindcssVitePlugin(): VitePlugin;
}
