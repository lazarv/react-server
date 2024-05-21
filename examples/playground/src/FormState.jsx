"use client";

import { useActionState } from "react";
import { useFormStatus } from "react-dom";

function Status() {
  const { pending } = useFormStatus();
  return pending ? "Saving..." : null;
}

export default function FormState({ action }) {
  const [state, dispatch] = useActionState(action, { name: "foobar" });
  return (
    <form action={dispatch}>
      <pre>State: {JSON.stringify(state, null, 2)}</pre>
      <label>
        Name: <input name="name" />
      </label>
      <button>Say Hi</button>
      <Status />
    </form>
  );
}
