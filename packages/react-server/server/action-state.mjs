import { getContext } from "./context.mjs";
import { ACTION_CONTEXT } from "./symbols.mjs";

export function useActionState(action) {
  const { formData, data, error, actionId } = getContext(ACTION_CONTEXT) ?? {
    formData: null,
    data: null,
    error: null,
    actionId: null,
  };
  if (actionId !== action.$$id) {
    return {
      formData: null,
      data: null,
      error: null,
      actionId: action.$$id,
    };
  }
  return { formData, data, error, actionId };
}
