"use server";

import { redirect } from "@lazarv/react-server";
import Database from "better-sqlite3";
import * as zod from "zod";

const db = new Database("db.sqlite");
db.exec(
  "CREATE TABLE IF NOT EXISTS todos (id INTEGER PRIMARY KEY AUTOINCREMENT, title TEXT)"
);

type Todo = {
  id: number;
  title: string;
};

const addTodoSchema = zod.object({
  title: zod
    .string()
    .min(3, "Title must be at least 3 characters")
    .max(100, "Title must be at most 100 characters")
    .refine((value) => value.length > 0, "Title is required")
    .transform((value) => value.trim()),
});

const deleteTodoSchema = zod.object({
  id: zod.string().transform((value) => parseInt(value.trim(), 10)),
});

export async function addTodo(formData: FormData) {
  const result = addTodoSchema.safeParse(Object.fromEntries(formData));

  if (!result.success) {
    throw result.error.issues;
  }

  const { title } = result.data;
  db.prepare("INSERT INTO todos(title) VALUES (?)").run(title);
  redirect("/");
}

export function allTodos() {
  return db.prepare("SELECT * FROM todos").all() as Todo[];
}

export async function deleteTodo(formData: FormData) {
  const result = deleteTodoSchema.safeParse(Object.fromEntries(formData));

  if (!result.success) {
    throw result.error.issues;
  }

  const { id } = result.data;
  db.prepare("DELETE FROM todos WHERE id = ?").run(id);
  redirect("/");
}
