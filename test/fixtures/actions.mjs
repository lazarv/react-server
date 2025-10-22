"use server";

import { redirect, reload, status } from "@lazarv/react-server";

export async function serverAction() {
  console.log("submitted server-action!");
}

export async function formAction(prevState, formData) {
  console.log("submitted useActionState!");
  console.log(`hello ${formData.get("name")}`);
  return {
    name: formData.get("name"),
    echo: `Hello ${formData.get("name")}!`,
    prev: prevState.name,
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

export async function formDataAction() {
  console.log("submitted form-data-action!");
  const formData = new FormData();
  formData.append("hello", "world");
  return formData;
}

export async function arrayBufferAction() {
  console.log("submitted array-buffer-action!");
  return new ArrayBuffer(10);
}

export async function bufferAction() {
  console.log("submitted buffer-action!");
  return Buffer.from("hello");
}

export async function arrayBufferViewAction() {
  console.log("submitted array-buffer-view-action!");
  return new Uint8Array(10);
}

export async function blobAction() {
  console.log("submitted blob-action!");
  return new Blob(["hello"], { type: "text/plain" });
}

export async function streamAction() {
  console.log("submitted stream-action!");
  return new ReadableStream({
    async start(controller) {
      for (let i = 0; i < 3; i++) {
        controller.enqueue(`hello ${i}`);
        await new Promise((resolve) => setTimeout(resolve, 100));
      }
      controller.close();
    },
  });
}

export async function* iteratorAction() {
  console.log("submitted iterator-action!");
  for (let i = 0; i < 3; i++) {
    yield `hello ${i}`;
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
}

export async function textAction() {
  console.log("submitted text-action!");
  return "hello";
}

export async function jsonAction() {
  console.log("submitted json-action!");
  return { hello: "world" };
}

export async function noContentAction() {
  console.log("submitted no-content-action!");
}

export async function errorAction() {
  console.log("submitted error-action!");
  status(500);
  throw new Error("error-action");
}

export async function reloadAction() {
  console.log("submitted reload-action!");
  reload("/", "rsf");
  return { hello: "world", timestamp: Date.now() };
}

export async function redirectAction() {
  console.log("submitted redirect-action!");
  redirect("/some-other-page");
}
