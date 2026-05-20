// Execute scripts stored as <template data-script-attrs> by dom-flight.mjs
// to avoid React's "Encountered a script tag" warning during SSR/RSC rendering.
// We leave the template in the DOM so React can still reconcile its fiber tree.
const activatedTemplates = new WeakSet();

export function activateScriptTemplates(root) {
  if (typeof document === "undefined" || !root?.querySelectorAll) return;
  root.querySelectorAll("template[data-script-attrs]").forEach((template) => {
    if (activatedTemplates.has(template)) return;
    activatedTemplates.add(template);
    const attrs = JSON.parse(template.dataset.scriptAttrs);
    const script = document.createElement("script");
    for (const [key, value] of Object.entries(attrs)) {
      script.setAttribute(key, value);
    }
    script.textContent =
      template.dataset.scriptContent ?? template.content.textContent;
    // Append to execute, then remove the script (not the template).
    document.head.appendChild(script);
    script.remove();
  });
}
