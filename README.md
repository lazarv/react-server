![@lazarv/react-server](https://github.com/lazarv/react-server/blob/7f56153ae10f304a2777c652c82d394c7560cf91/docs/public/opengraph.jpg?raw=true "@lazarv/react-server")

The easiest way to build [React](https://react.dev) apps with server-side rendering.

Combines the fantastic developer experience of using Vite for React development and all the new React 19 features.

And more...

## Features

#### React Server Components
- [x] async components
- [x] client components with `"use client";`
- [x] error boundaries
- [x] streaming server-side rendering
- [x] selective hydration

#### Server Functions
- [x] server modules and inline server functions with `"use server";`
- [x] progressive enhancement

#### File-system based router
- [x] pages
- [x] layouts
- [x] outlets
- [x] error boundaries
- [x] loading fallbacks
- [x] Markdown support
- [x] REST API routes
- [x] middlewares
- [x] static export

#### Performance
- [x] response caching and revalidation
- [x] React hot module replacement using Vite
- [x] blazing-fast production build using node.js cluster

## Getting started

#### Quick Start

To bootstrap your `@lazarv/react-server` project, you can use `@lazarv/create-react-server`, the official CLI tool to create a new project and add initial tools, features and third-party integrations to your project with ease, just by answering a few questions. To use the tool, run:

```sh
npx @lazarv/create-react-server
```

Completing the wizard, follow the instructions in your terminal to explore your new project and have fun!

#### Install

Use a package manager to add `@lazarv/react-server` to your project. pnpm is a great choice to do it!

```sh
pnpm add @lazarv/react-server
```

#### Create your app

Create an entrypoint for your app and export your root component as default.

```tsx
export default function App() {
  return (
    <h1>
      Hello World!
    </h1>
  );
}
```

#### Run your app

Similarly how you would run a script with `node`, use `react-server` to start your app. Magic!

```sh
pnpm exec react-server ./App.tsx
```

> **Note:** if you don't want to install the `@lazarv/react-server` package and you just want to try out something quickly, you can use `npx` to run the `react-server` CLI. This way, it's not required to install anything else if you use JavaScript. It's enough to have a `.jsx` file with a React Server Component exported as default to run your application. Just run `npx @lazarv/react-server ./App.jsx` to start your application in development mode.

#### Build

For production build use the `build` command of `react-server`. This will build your app both for the server and the client side. Your build will be available in the `.react-server` folder of your project.

```sh
pnpm exec react-server build ./App.tsx
```

#### Run in production

To start your app after a successful production build, you will need to use the `start` command of `react-server`.

```sh
pnpm exec react-server start
```

You can unleash cluster mode by using the `REACT_SERVER_CLUSTER` environment variable.

```sh
REACT_SERVER_CLUSTER=8 pnpm exec react-server start
```

## File-system based routing

To enable file-system based routing, you just omit the entrypoint when running a `@lazarv/react-server` app.

Create a `@lazarv/react-server` configuration file in your project root to specify where the router should start processing files by using the `root` property. By default every file are included in the routing, but you can include/exclude using arrays of glob patterns. The following example will only include `page.tsx` files as pages and `layout.tsx` files as layouts, emulating the behavior of Next.js.

#### `react-server.config.json`

```json
{
  "root": "app",
  "page": {
    "include": ["**/page.tsx"],
  },
  "layout": {
    "include": ["**/layout.tsx"],
  }
}
```

Move your entrypoint component from `./App.tsx` to `./app/layout.tsx` and `./app/page.tsx` to transform it into a page with a layout.

Just start `react-server` without specifying an entrypoint.

```sh
pnpm exec react-server
```

Read more about file-system based routing at [react-server.dev/router](https://react-server.dev/router).

## Documentation

Check out the full documentation at [react-server.dev](https://react-server.dev).

The documentation site was fully created using this framework and so it also functions as a static site example. To start the documentation site locally, use:

```sh
pnpm --filter ./docs dev
```

## Examples

You can try out the existing examples in this repo by using the following commands:

```sh
git clone https://github.com/lazarv/react-server.git
cd react-server
pnpm install
```

And then run the example you want to check out:

```sh
pnpm --filter ./examples/todo dev --open
pnpm --filter ./examples/photos dev --open
pnpm --filter ./examples/express dev
pnpm --filter ./examples/nestjs start:dev
pnpm --filter ./examples/spa dev --open
pnpm --filter ./examples/react-router dev --open
pnpm --filter ./examples/tanstack-router dev --open
pnpm --filter ./examples/react-query dev --open
pnpm --filter ./examples/mui dev --open
pnpm --filter ./examples/mantine dev --open
```

You will need to have `pnpm` installed. Follow instructions at https://pnpm.io/installation.

## License

[MIT](https://github.com/lazarv/react-server/blob/main/LICENSE)