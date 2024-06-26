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

#### Server Actions
- [x] server modules and inline server actions with `"use server";`
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

#### Install

Use a package manager to add `@lazarv/react-server` to your project. pnpm is a great choice to do it!

```sh
pnpm add @lazarv/react-server
```

#### Peer dependencies

`@lazarv/react-server` uses react, react-dom and react-server-dom-webpack as peer dependencies. Until all React dependencies are not released as latest the framework uses a pinned version of React. To install this version specifically the best way is to let `pnpm` install these for you.

If your project is not set up to auto-install peer dependencies, add this to your `.npmrc`:

```sh
auto-install-peers=true
```

or alternatively run:

```sh
pnpm config set auto-install-peers true --location project
```

#### Create your app

Create an entrypoint for your app and export your root component as default.

```tsx
export default function App() {
  return (
    <html lang="en">
      <head>
        <meta charSet="utf-8" />
        <title>@lazarv/react-server</title>
      </head>
      <body>
        Hello World!
      </body>
    </html>
  );
}
```

#### Run your app

Similarly how you would run a script with `node`, use `react-server` to start your app. Magic!

```sh
pnpm exec react-server ./App.tsx --open
```

> **Note:** if you don't want to install the `@lazarv/react-server` package and you just want to try out something quickly, you can use `npx` to run the `react-server` CLI. This way, it's not required to install anything else if you use JavaScript. It's enough to have a `.jsx` file with a React Server Component exported as default to run your application. Just run `npx @lazarv/react-server ./App.jsx --open` to start your application in development mode.

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

## @lazarv/react-server-router

To enable file-system based routing, you need to install the `@lazarv/react-server-router` package and you no longer need to specify and entrypoint for your app.

```sh
pnpm add @lazarv/react-server-router
```

Create a `@lazarv/react-server` configuration file in your project root to specify where the router should start processing files. By default every file are included in the routing, but you can include/exclude using arrays of glob patterns.

#### `react-server.config.json`

```json
{
  "root": "src"
}
```

Move your entrypoint from `./App.tsx` to `./src/page.tsx` to transform it into a page.

Just start `react-server` without using an entrypoint.

```sh
pnpm exec react-server --open
```

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
```

You will need to have `pnpm` installed. Follow instructions at https://pnpm.io/installation.

## License

[MIT](https://github.com/lazarv/react-server/blob/main/LICENSE)