"use client";

import { useActionState } from "react";
import { useFormStatus } from "react-dom";

import { formAction } from "./actions.mjs";

function SubmitButton() {
  const { pending } = useFormStatus();

  return (
    <button type="submit" disabled={pending}>
      Submit
    </button>
  );
}

export default function App() {
  const [state, dispatch] = useActionState(formAction, {
    name: "",
  });

  return (
    <form action={dispatch}>
      <pre>{JSON.stringify(state, null, 2)}</pre>
      <input type="text" name="name" defaultValue={state.name} />
      <SubmitButton />
    </form>
  );
}
