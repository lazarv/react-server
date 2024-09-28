# Deploy Adapter AWS

The bundling of the app for deployment to AWS Lambda requires the aws adapter in `react-server.config.json`:

```json
{
  "root": "src",
  "adapter": "@lazarv/react-server-adapter-aws"
}
```

add `.aws-lambda` to `.gitignore`

This example contains example configuration for three AWS deployment frameworks:
* [AWS CDK](#aws-cdk)
* [Serverless Framework V3](#serverless-framework-v3)
* [SST V3 (ion)](#sst-v3-ion)

**Important:** change the name of the stack to a unique name in your account!

you need to build before deployment:
```sh
pnpm build
```

## AWS CDK

required files and folders:
* `cdk.json`
* `cdk`

add the following packages:
```sh
pnpm add aws-cdk-lib constructs source-map-support
pnpm add -D aws-cdk tsx
```

add to `.gitignore`:
```
cdk.out
```

Configuration of the stack is possible in `cdk/bin/infrastructure.ts`:
* custome domain
* ssl certificate

**deploy:**
```sh
pnpm cdk deploy --all
```

**remove stack:**
```sh
pnpm cdk destroy --all
```

## Serverless Framework V3

required files and folders:
* serverless.yml

add the following packages:
```sh
pnpm add -D serverless@3 serverless-cloudfront-invalidate serverless-s3-sync
```

add to `.gitignore`:
```
.serverless
```

get FrontendCloudFrontDistributionUrl:
`pnpm sls info --verbose`

**deploy:**
```sh
pnpm sls deploy
```

**remove stack:**
```sh
pnpm sls remove
```

## SST V3 (ion)

Currently only deployment is supported, dev mode is not implemented and boken.

The sample configuration support AWS Cloudfront and static assets from AWS S3.

required files and folders:
* `sst-env.d.ts`
* `sst.config.ts`

create a symbolic link from `react-server.ts`
```sh
cd .sst/platform/src/components/aws
ln ../../../../../react-server.js react-server.js
```

add `export * from "./react-server.js";` to `.sst/platform/src/components/aws/index.ts`

add the following packages:
```sh
pnpm add -D sst
```

add to `.gitignore`:
```
.sst
```

**deploy:**
```sh
pnpm sst deploy
```

**remove stack:**
```sh
pnpm sst remove
```