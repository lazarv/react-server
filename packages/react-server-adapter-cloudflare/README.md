# @lazarv/react-server-adapter-cloudflare

Cloudflare Workers/Pages adapter for `@lazarv/react-server`.

## Installation

```bash
pnpm add @lazarv/react-server-adapter-cloudflare
```

## Usage

Add the adapter to your `react-server.config.mjs`:

```js
export default {
  adapter: "@lazarv/react-server-adapter-cloudflare",
};
```

Or with custom options:

```js
export default {
  adapter: [
    "@lazarv/react-server-adapter-cloudflare",
    {
      name: "my-app", // Cloudflare Worker name
      wrangler: {
        vars: {
          MY_VAR: "value",
        },
      },
    },
  ],
};
```

The adapter automatically configures the build for Cloudflare edge runtime compatibility.

## Build and Deploy

Build and deploy your app with:

```bash
react-server build ./App.jsx --deploy
```

Or build first, then deploy separately:

```bash
react-server build ./App.jsx
wrangler deploy
```

## Configuration Options

| Option | Type | Description |
|--------|------|-------------|
| `name` | `string` | Cloudflare Worker name. Falls back to `package.json` name (without scope) or "react-server-app" |
| `compatibilityDate` | `string` | Cloudflare compatibility date (default: current date) |
| `compatibilityFlags` | `string[]` | Additional Cloudflare compatibility flags (appended to required `nodejs_compat`) |
| `pages` | `boolean` | Generate `_routes.json` for Cloudflare Pages (default: true) |
| `excludeRoutes` | `string[]` | Additional routes to exclude from worker handling in `_routes.json` |
| `wrangler` | `object` | Additional wrangler.toml configuration as an object (merged with adapter defaults) |

## Extending wrangler.toml

To extend the generated `wrangler.toml`, create a `react-server.wrangler.toml` file in your project root. The adapter will merge it with its configuration:

- **Primitive values**: Adapter config takes precedence
- **Objects**: Deep merged recursively
- **Arrays**: Unique items from your config are preserved and prepended to adapter defaults

This allows you to add custom bindings, environment variables, or other Cloudflare-specific configuration while the adapter manages the required settings.

Example `react-server.wrangler.toml`:

```toml
[vars]
MY_API_KEY = "secret"

[[kv_namespaces]]
binding = "MY_KV"
id = "abc123"
```

## Requirements

- Cloudflare account with Workers enabled
- `wrangler` CLI installed (`npm install -g wrangler`)
