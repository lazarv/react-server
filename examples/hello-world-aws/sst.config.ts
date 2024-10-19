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
    new sst.aws.ReactServer("ReactServertackDemoApp", {
      server: {
        architecture: "arm64",
      },
    });
  },
});
