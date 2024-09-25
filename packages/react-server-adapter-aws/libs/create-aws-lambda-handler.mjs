import awsLambdaAdapter from "@hattip/adapter-aws-lambda";

import { createHandler } from "./create-handler.mjs";

export const createAWSLambdaHandler = async () =>
  awsLambdaAdapter(
    await createHandler({
      origin: process.env.ORIGIN || "http://localhost:3000",
      outDir: process.env?.OUT_DIR,
    })
  );
