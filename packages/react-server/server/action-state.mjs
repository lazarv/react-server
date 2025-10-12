import { dynamicHookError } from "../lib/utils/error.mjs";
import { getContext } from "./context.mjs";
import { usePostpone } from "./postpone.mjs";
import { ACTION_CONTEXT, SERVER_FUNCTION_NOT_FOUND } from "./symbols.mjs";

export class ServerFunctionNotFoundError extends Error {
  constructor(message) {
    super(message);
    this.name = SERVER_FUNCTION_NOT_FOUND;
    this.message = message ?? "Server Function Not Found";
    this.stack = new Error().stack;
  }
}

export function useActionState(action) {
  usePostpone(dynamicHookError("useActionState"));

  const { formData, data, error, actionId } = getContext(ACTION_CONTEXT) ?? {
    formData: null,
    data: null,
    error: null,
    actionId: null,
  };
  if (actionId !== action.$$id && error?.name !== SERVER_FUNCTION_NOT_FOUND) {
    return {
      formData: null,
      data: null,
      error: error ?? null,
      actionId: action.$$id,
    };
  }
  return { formData, data, error, actionId };
}
