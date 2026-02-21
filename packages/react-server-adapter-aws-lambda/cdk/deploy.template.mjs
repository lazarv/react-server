#!/usr/bin/env node
import { join, resolve } from "node:path";

import { ReactServerAwsStack } from "@lazarv/react-server-adapter-aws-lambda/cdk";
import * as cdk from "aws-cdk-lib";

const app = new cdk.App();
const projectRoot = process.cwd();

// Example defaults – adjust to your project layout as needed
const outDir = resolve(projectRoot, ".aws-lambda/output");
const functionDir = resolve(
  projectRoot,
  ".aws-lambda/output/functions/index.func"
);

// Check for react-server config and extract adapter configuration
/*
let adapterConfig = {
    streaming: false,
    serverlessFunctions: true,
};
const configPaths = [
    resolve(projectRoot, "react-server.config.json"),
    resolve(projectRoot, "react-server.config.mjs"),
];

for (const configPath of configPaths) {
    try {
        let config;
        if (configPath.endsWith(".json")) {
            config = JSON.parse(readFileSync(configPath, "utf8"));
        } else if (configPath.endsWith(".mjs")) {
            config = await import(configPath);
        }
        if (
            typeof config?.adapter?.["@lazarv/react-server-adapter-aws-lambda"] ===
            "object"
        ) {
            adapterConfig = config.adapter["@lazarv/react-server-adapter-aws-lambda"];

            break;
        }
    } catch (error) {
        // Config file doesn't exist or failed to load, continue to next
    }
}
*/
const adapterConfig = (await import(join(functionDir, "adapter.config.mjs")))
  .default;
console.log("Using adapter configuration:", adapterConfig);

// Collect lambda environment variables from the current shell
// - ORIGIN: optional override
// - DEBUG_AWS_LAMBDA_ADAPTER: enable debug logs in handlers
// - Any variables prefixed with LAMBDA_ will also be forwarded
const lambdaEnv = {};
if (process.env.ORIGIN) lambdaEnv.ORIGIN = process.env.ORIGIN;
if (process.env.DEBUG_AWS_LAMBDA_ADAPTER)
  lambdaEnv.DEBUG_AWS_LAMBDA_ADAPTER = process.env.DEBUG_AWS_LAMBDA_ADAPTER;
for (const [key, value] of Object.entries(process.env)) {
  if (key.startsWith("LAMBDA_") && typeof value === "string") {
    lambdaEnv[key] = value;
  }
}

new ReactServerAwsStack(app, "ReactServerAwsStack", {
  env: {
    account: process.env.CDK_DEFAULT_ACCOUNT,
    region: process.env.CDK_DEFAULT_REGION,
  },
  outDir,
  adapterConfig,
  lambdaEnv,
});
