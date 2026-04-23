# Hello World (AWS Lambda)

This example builds a minimal React Server app and bundles a Lambda handler that runs behind API Gateway v2.

## Try it locally

Build the example:

```sh
pnpm build
```

Run the Lambda handler locally with debug logging and the safety auto-end enabled:

```sh
# print request/response lifecycle logs
# auto-end finishes the response shortly after first write (API Gateway v2 isn't streaming)
DEBUG_AWS_LAMBDA_ADAPTER=1 \
  pnpm dlx lambda-handler-tester@latest --handler .aws-lambda/output/functions/index.func/index.mjs
```

You should see a 200 response with a small HTML body and logs like:

```
[react-server][response.write] { type: 'object', length: 66, encoding: undefined }
[react-server][response.writeHead] { statusCode: 200, ... }
[react-server][auto-end] forcing res.end() after write
```

## Environment flags

- `DEBUG_AWS_LAMBDA_ADAPTER`
  - Enables verbose logs. Accepts: `1`, `true`, `yes`.

## Deploying

The build outputs a self-contained function folder at:

```
.aws-lambda/output/functions/index.func/
```

You can deploy this Lambda behind an API Gateway v2 HTTP API using your preferred tooling (CDK/Terraform/Serverless/etc.).

If you're using the adapter's default deploy hint, run:

```sh
npx cdk deploy
```

Note: API Gateway v2 won’t stream the payload; the auto-end guard prevents hung responses.
