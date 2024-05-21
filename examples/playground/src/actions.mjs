"use server";

import { randomUUID } from "node:crypto";

export const state = { value: "" };
export const serverAction = async function serverAction(formData) {
  const uuid = randomUUID();
  if (formData.get("file1")) console.log(await formData.get("file1").text());
  if (formData.get("file2")) console.log(await formData.get("file2").text());
  console.log("generate random uuid", uuid);
  state.value = uuid;
};
