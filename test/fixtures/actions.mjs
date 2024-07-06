"use server";

export async function serverAction() {
  console.log("submitted server-action!");
}

export async function formAction(prevState, formData) {
  console.log("submitted useActionState!");
  console.log(`hello ${formData.get("name")}`);
  return {
    name: formData.get("name"),
    echo: `Hello ${formData.get("name")}!`,
  };
}

export async function callActionProp() {
  console.log("submitted call-action-prop!");
  return "call-action-prop";
}

export async function callActionImport() {
  console.log("submitted call-action-import!");
  return "call-action-import";
}
