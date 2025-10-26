"use server";

import { redirect, reload } from "@lazarv/react-server";

export async function createOrUpdateNote(prevState: any, data: FormData) {
  const title = data.get("title");
  const note = data.get("note");

  if (!title || title.toString().trim().length === 0) {
    return {
      error: [{ message: "Title is required" }],
      title,
      note,
    };
  }

  if (!note || note.toString().trim().length === 0) {
    return {
      error: [{ message: "Note is required" }],
      title,
      note,
    };
  }

  if (title.toString().toLowerCase() === "error") {
    throw new Error("Test error from createOrUpdateNote");
  }

  if (Math.random() < 0.5) {
    redirect("/");
  } else {
    reload("/");
  }
}

export interface Note {
  id?: string;
  title: string;
  note: string;
}
