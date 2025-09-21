"use server";

export async function uploadFile(prevState, formData) {
  return {
    ...prevState,
    status: "uploaded",
    file: formData.get("file")?.name ?? null,
    size: formData.get("file")?.size ?? null,
  };
}
