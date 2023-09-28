import { createServerContext, useContext } from "react";

export const ActionStateContext = createServerContext("ActionStateContext", {
  formData: null,
  data: null,
  error: null,
  actionId: null,
});

export function useActionState(action) {
  const { formData, data, error, actionId } = useContext(ActionStateContext);
  if (actionId !== action.$$id) {
    return { formData: null, data: null, error: null, actionId: action.$$id };
  }
  return { formData, data, error, actionId };
}
