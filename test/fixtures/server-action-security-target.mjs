console.log("FORGED_NON_ACTION_MODULE_LOADED");

// The source does contain an inline Server Function. Its transform creates a
// separate virtual server-action module; it must not make this module's other
// exports callable as Server Functions.
export async function actualAction() {
  "use server";
  return "actual action";
}

export async function notAnAction() {
  console.log("FORGED_NON_ACTION_EXPORT_CALLED");
}
