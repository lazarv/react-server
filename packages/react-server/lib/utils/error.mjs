export function replaceError(e) {
  if (!e || !e.message) {
    return e;
  }
  if (
    ["named export", "not found", "requested module", "react-dom"].every((it) =>
      e.message.toLowerCase().includes(it)
    )
  ) {
    if (e.message.includes("useFormStatus")) {
      return new Error(
        `Warning: useFormStatus only works on the client. Add 'use client' to create a client component.`
      );
    }

    if (e.message.includes("useFormState")) {
      return new Error(
        `Warning: useFormState is now deprecated. Use useActionState from "react" instead and add 'use client'.`
      );
    }
  } else if (
    ["resolveDispatcher", "useActionState is not a function"].every((it) =>
      e.message.includes(it)
    )
  ) {
    return new Error(
      `Warning: useActionState only works on the client. Add 'use client' to create a client component.`
    );
  }
  return e;
}

export function deleteLastXLines(x) {
  if (x > 0) {
    // move cursor X lines up
    if (x > 1) {
      process.stdout.write("\u001b[" + (x - 1) + "A");
    }

    // clear each of the X lines
    for (let i = 0; i < x; i++) {
      process.stdout.write("\u001b[2K"); // clear the current line
      if (i < x - 1) {
        process.stdout.write("\n"); // move cursor to the next line
      }
    }

    // move cursor X lines up again to return to the original position
    process.stdout.write("\u001b[" + x + "A");
  }
}
