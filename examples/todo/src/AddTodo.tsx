import { useActionState } from "@lazarv/react-server/router";
import type { ZodIssue } from "zod";

import { addTodo } from "./actions";

export default function AddTodo() {
  const { formData, error } = useActionState<
    typeof addTodo,
    string & Error & ZodIssue[]
  >(addTodo);

  return (
    <form action={addTodo} className="mb-4">
      <div className="mb-2">
        <input
          name="title"
          type="text"
          className="bg-gray-50 border border-gray-300 text-gray-900 rounded-lg p-2.5"
          defaultValue={formData?.get?.("title") as string}
          // eslint-disable-next-line jsx-a11y/no-autofocus
          autoFocus
        />
      </div>
      <button
        className="text-white bg-blue-700 hover:bg-blue-800 rounded-lg px-5 py-2 mb-2 text-center"
        type="submit"
      >
        Submit
      </button>
      {error?.map?.(({ message }, i) => (
        <p
          key={i}
          className="bg-red-50 border rounded-lg border-red-500 text-red-500 p-2.5 mb-2"
        >
          {message}
        </p>
      )) ??
        (error && (
          <p className="bg-red-50 border rounded-lg border-red-500 text-red-500 p-2.5">
            {error?.toString()}
          </p>
        ))}
    </form>
  );
}
