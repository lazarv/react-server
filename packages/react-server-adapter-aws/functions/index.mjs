import { createHandler } from "@lazarv/react-server-adapter-aws/create-handler";
import { awsLambdaAdapter as lambdaHandler } from "@lazarv/react-server-adapter-aws/hono-lambda-adapter";

const rsHandler = await createHandler({
  origin: process.env.ORIGIN || "http://localhost:3000",
  outDir: process.env?.OUT_DIR,
});

export const handler = lambdaHandler(rsHandler);
