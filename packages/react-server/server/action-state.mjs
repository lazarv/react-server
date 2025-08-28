import { getContext } from "./context.mjs";
import { ACTION_CONTEXT, SERVER_FUNCTION_NOT_FOUND } from "./symbols.mjs";

export class ServerFunctionNotFoundError extends Error {
  constructor(message) {
    super(message);
    this.name = SERVER_FUNCTION_NOT_FOUND;
    this.message = message;
    this.stack = new Error().stack;
  }
}

export function useActionState(action) {
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
      error: null,
      actionId: action.$$id,
    };
  }
  return { formData, data, error, actionId };
}
