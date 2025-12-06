import { DefaultHandler } from "@h4ad/serverless-adapter/handlers/default";
import { PromiseResolver } from "@h4ad/serverless-adapter/resolvers/promise";

import { createGetAdapter, runHandler } from "./shared.mjs";

const getAdapter = createGetAdapter(DefaultHandler, PromiseResolver);

export async function handler(event, context) {
  return runHandler(event, context, getAdapter);
}

export default handler;
