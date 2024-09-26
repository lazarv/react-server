// eslint-disable-next-line @typescript-eslint/triple-slash-reference
/// <reference path="./.sst/platform/config.d.ts" />

export default $config({
  app(input) {
    return {
      name: "hello-world-aws",
      removal: input?.stage === "production" ? "retain" : "remove",
      home: "aws",
      providers: { aws: "6.52.0" },
    };
  },

  async run() {
    const api = new sst.aws.ApiGatewayV2("ApiGateway");
    api.route("$default", {
      handler: "index.handler",
      bundle: "bundle", // disable bundling with esbuild
      copyFiles: [
        {
          from: ".aws-lambda/output/static",
          to: ".react-server",
        },
        {
          from: ".aws-lambda/output/functions/index.func",
          to: ".",
        },
      ],
      environment: {
        NODE_ENV: "production",
      },
    });
  },
});
