# @lazarv/react-server-adapter-aws-lambda

AWS Lambda adapter for `@lazarv/react-server` with CloudFront distribution and advanced static asset routing.

## Features

### 🚀 **Dual Lambda Modes**
- **Streaming Mode**: Lambda Function URL with `RESPONSE_STREAM` for real-time SSR streaming
- **Buffered Mode**: API Gateway v2 HTTP API for traditional request/response

### 📁 **Flexible Static Asset Routing**
- **Path Behaviors Mode** (`routingMode: "pathBehaviors"`): CloudFront behaviors per top-level static directory
- **Edge Function Routing Mode** (`routingMode: "edgeFunctionRouting"`): CloudFront Functions with KeyValueStore for intelligent asset routing

### 🌐 **Production-Ready CloudFront Setup**
- Private S3 bucket with Origin Access Control (OAC)
- Automatic cache invalidation on deployment
- Custom error responses (S3 404/403 → Lambda fallback)
- Optimized caching policies for static assets vs. SSR content
- CORS support and compression enabled

### 🔧 **Developer Experience**
- Vite-powered bundling with tree-shaking and dependency optimization
- Auto-scaffolding of CDK infrastructure
- Built-in debugging with `DEBUG_AWS_LAMBDA_ADAPTER=1` and `DEBUG_AWS_LAMBDA_ADAPTER=2`
- Graceful fallbacks for missing dependencies

## Architecture

### CloudFront Routing (pathBehaviors)

```
Internet → CloudFront → S3 (static assets) 
                    └→ Lambda Function URL streaming (SSR) - OR - API Gateway v2 → Lambda buffered (SSR)
```

### Edge Function Routing Mode (edgeFunctionRouting)
```
CloudFront Function (viewer-request) 
  ↓ checks KeyValueStore if route matches static asset
  ↓ routes to appropriate origin:
  ├─ S3 bucket (static/assets/client/public files)
  └─ Lambda Function URL streaming (SSR, dynamic routes, 404 handling) - OR - API Gateway v2 → Lambda buffered (SSR)
```

## Configuration

```javascript
// react-server.config.mjs
export default {
  adapter: "@lazarv/react-server-adapter-aws-lambda",
  adapterOptions: {
    streaming: true, // Enable Lambda Function URL streaming
    routingMode: "edgeFunctionRouting", // or "pathBehaviors"
    lambdaEnv: {
      DEBUG: "react-server-adapter",
      // Custom environment variables
    },
    maxBehaviors: 10, // CloudFront behavior limit
  },
};
```

## How it works

### Build Process

1. **Function Bundling**: Entry handler is bundled with Vite at `functions/index.mjs` into `.aws-lambda/output/functions/index.func/index.mjs`
2. **Dependency Optimization**: Inlines Node ESM dependencies, externalizes only:
   - `@lazarv/react-server` (and subpaths)
   - Node built-ins (fs, path, url, http, etc.)
3. **Runtime Dependencies**: Scans final entry and copies external runtime deps
4. **Infrastructure Generation**: CDK constructs for CloudFront + S3 + Lambda
5. **Static Asset Routing**: Generates routing table for edge function mode

### Routing Modes

#### Path Behaviors Mode
- Creates CloudFront behaviors for each top-level directory in static output
- Simple and reliable, but limited by CloudFront's 25 behavior limit per distribution
- Best for: Small to medium sites with predictable static structure

#### Edge Function Routing Mode
- Uses CloudFront Functions with KeyValueStore for intelligent routing
- No behavior limits, routes via edge function logic
- Generates `static_files.json` mapping for all asset types
- Best for: Large sites with many static directories or dynamic routing needs

### Error Handling

CloudFront custom error responses automatically fallback to Lambda:
- S3 **403 AccessDenied** → Lambda `/404` route (200 status)
- S3 **404 NotFound** → Lambda `/404` route (200 status)
- Short TTL (10s) to avoid caching transient errors

## Quick Start

1. **Install and configure**:
```bash
npm install @lazarv/react-server-adapter-aws-lambda
```

2. **Set up react-server.config.mjs**:
```javascript
export default {
  adapter: "@lazarv/react-server-adapter-aws-lambda",
};
```

3. **Build and deploy**:
```bash
npx react-server build --deploy
```

## Environment Variables

Set in `lambdaEnv` config or via AWS CLI:

- `DEBUG_AWS_LAMBDA_ADAPTER=1` - Enable adapter status/http reques logging
- `DEBUG_AWS_LAMBDA_ADAPTER=2` - Enable lambda event logging
- `ORIGIN` - CloudFront domain (auto-set during deployment)

## Project Structure After Build

```
.aws-lambda/output/
├── functions/index.func/        # Lambda function code
│   ├── index.mjs               # Bundled entry point
│   ├── adapter.config.mjs      # Runtime adapter config
│   ├── package.json           # ESM module marker
│   └── node_modules/          # External dependencies
├── static/                     # Static assets for S3
│   ├── client/                # Client-side bundles
│   ├── assets/                # Images, fonts, etc.
│   └── *.x-component          # RSC payload files
└── static_files.json          # Asset routing table (edge mode only)

cdk.json                       # CDK app configuration
infra/bin/deploy.mjs          # CDK deployment script
```


## Testing & Debugging

### Local Testing

Test the built function locally with the included smoke test:
```bash
node packages/react-server-adapter-aws-lambda/functions/smoke-test.mjs
```

Or use `lambda-handler-tester` for more realistic testing:
```bash
npx lambda-handler-tester --watch 8010 .aws-lambda/output/functions/index.func/index.mjs
```

### Production Debugging

Enable verbose logging in deployed Lambda:

**Option A: Redeploy with debug flag**
```bash
DEBUG_AWS_LAMBDA_ADAPTER=1 npx cdk deploy
```

**Option B: Update existing function**
```bash
aws lambda update-function-configuration \
  --function-name <FUNCTION_NAME> \
  --environment "Variables={DEBUG_AWS_LAMBDA_ADAPTER=1,ORIGIN=https://your-cloudfront-domain}"
```

**View logs**:
```bash
aws logs tail /aws/lambda/<FUNCTION_NAME> --since 5m --format short
```

### Debug Environment Variables

- `DEBUG_AWS_LAMBDA_ADAPTER=1` - Log all events and responses

## CloudFront Features

### Caching Strategy
- **Dynamic content** (SSR): No caching (`CACHING_DISABLED`)
- **Static assets**: Long-term caching (365 days for versioned assets)
- **RSC files** (`.x-component`): Short revalidation (1 day) with stale-while-revalidate

### Headers & CORS
- Automatic CORS headers for static assets
- Host header excluded for Lambda Function URLs (prevents 403 errors)
- Custom content-type for React Server Components (`text/x-component`)

### Security
- Private S3 bucket with Origin Access Control
- HTTPS enforcement for all content
- No public S3 access (CloudFront-only)

## Advanced Configuration

### Custom Lambda Settings
```javascript
export default {
  adapter: [
    "@lazarv/react-server-adapter-aws-lambda",
    adapterOptions: {
      streaming: true,
      routingMode: "edgeFunctionRouting",
      lambdaEnv: {
        CUSTOM_VAR: "value",
        DEBUG: "react-server-adapter",
      },
      // CDK-level customizations via environment
      lambdaRuntime: "NODEJS_22_X", // Set via env: CDK_LAMBDA_RUNTIME
      maxBehaviors: 25, // Increase CloudFront behavior limit
    },
  ]
};
```

## Limitations

- **CloudFront behavior limit**: 25 behaviors per distribution (affects path behaviors mode)
- **Lambda timeout**: 15 seconds maximum (configurable in CDK)
- **Function URL limitations**: No custom domains without CloudFront
- **Cold starts**: First request after idle period may be slower

## Troubleshooting

### Common Issues

**S3 AccessDenied errors**: Check Origin Access Control configuration and bucket policies

**Lambda timeout**: Increase timeout in `react-server-stack.mjs` or optimize SSR performance

**404 on static assets**: Verify routing mode and static file deployment

**Host header errors**: Ensure `originRequestPolicy` excludes Host header for Function URLs

**Edge function errors**: Check CloudFront Function logs and KeyValueStore data

## License

MIT License - see the LICENSE file for details.

---

*This adapter provides production-ready serverless deployment with CloudFront CDN, automatic static asset optimization, and flexible routing strategies for React Server applications on AWS.*