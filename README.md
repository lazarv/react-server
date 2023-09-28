# What is @lazarv/react-server?

An experimental [React](https://react.dev) meta-framework using [Vite](https://vitejs.dev). It's a playground project to try out all the new React features available in the experimental versions of React.

Combines the fantastic developer experience of using Vite for React development and all the new React features presented by Next.js 13.

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
- [ ] data loaders
- [ ] layout breaking pages

#### Performance
- [x] response caching and revalidation
- [x] React hot module replacement using Vite
- [x] blazing-fast production build using node.js cluster

### Experimental features
- [ ] Remote components using React Server Components
- [ ] static export

## Getting started

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

Coming soon...

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
```

or

```sh
pnpm --filter ./examples/photos dev --open
```

You will need to have `pnpm` installed. Follow instructions at https://pnpm.io/installation.

## License

[MIT](https://github.com/lazarv/react-server/blob/main/LICENSE)