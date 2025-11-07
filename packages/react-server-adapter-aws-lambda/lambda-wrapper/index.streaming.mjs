import { createDefaultLogger } from "@h4ad/serverless-adapter";
import { ApiGatewayV2Adapter } from "@h4ad/serverless-adapter/adapters/aws";
import { AwsStreamHandler } from "@h4ad/serverless-adapter/handlers/aws";
import { DummyResolver } from "@h4ad/serverless-adapter/resolvers/dummy";

import { debug, getMiddlewares, ReactServerFramework } from "./shared.mjs";

/**
 * Lambda handler for streaming response mode.
 * CRITICAL: AwsStreamHandler.getHandler() returns a handler already wrapped with awslambda.streamifyResponse()
 * We must export that wrapped handler directly, not call it ourselves.
 */

// Get middlewares and create the handler (this runs once on cold start)
const middlewares = await getMiddlewares();
const DEBUG =
  process.env.DEBUG_AWS_LAMBDA_ADAPTER === "1" ||
  process.env.DEBUG_AWS_LAMBDA_ADAPTER === "2";
const logLevel =
  process.env.DEBUG_AWS_LAMBDA_ADAPTER === "2" ? "debug" : "warn";

// CRITICAL: callbackWaitsForEmptyEventLoop MUST be false to prevent timeouts
const awsStreamHandler = new AwsStreamHandler({
  callbackWaitsForEmptyEventLoop: false,
});

if (DEBUG) {
  debug("Creating streaming handler with callbackWaitsForEmptyEventLoop=false");
}

// AwsStreamHandler.getHandler() returns the handler already wrapped with streamifyResponse
export const handler = awsStreamHandler.getHandler(
  null, // app
  new ReactServerFramework(middlewares), // framework
  [new ApiGatewayV2Adapter()], // adapters
  new DummyResolver(), // resolver (not used in streaming mode)
  {
    contentEncodings: ["gzip", "deflate", "br"],
    contentTypes: [
      "image/png",
      "image/jpeg",
      "image/jpg",
      "image/avif",
      "image/bmp",
      "image/x-png",
      "image/gif",
      "image/webp",
      "video/mp4",
      "application/pdf",
    ],
  }, // binarySettings
  false, // respondWithErrors
  createDefaultLogger({ level: logLevel }) // logger
);

export default handler;
