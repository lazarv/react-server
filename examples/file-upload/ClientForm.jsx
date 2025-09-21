"use client";

import { useActionState } from "react";
import { uploadFile } from "./server.mjs";

export default function Form() {
  const [state, modUploadFile] = useActionState(uploadFile, {});

  return (
    <>
      <pre>{JSON.stringify(state, null, 2)}</pre>
      <form action={modUploadFile}>
        <input type="file" name="file" />
        <button type="submit">Upload</button>
      </form>
    </>
  );
}
