import { context$ } from "./context.mjs";
import { outlet, rewrite, useUrl } from "./request.mjs";
import { RELOAD } from "./symbols.mjs";

export function reload(url, target) {
  const currentUrl = url ? rewrite(url) : useUrl();
  const currentOutlet = outlet(target);
  context$(RELOAD, { url: currentUrl, outlet: currentOutlet });
}
