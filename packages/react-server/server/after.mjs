import { useHttpContext } from "@lazarv/react-server/server/request.mjs";

export function after(fn) {
  const ctx = useHttpContext();

  if (!ctx) {
    throw new Error(
      "`after` hook called outside of request context. It can only be used during a request."
    );
  }

  const { afterHooks } = ctx;
  afterHooks.add(fn);
}
