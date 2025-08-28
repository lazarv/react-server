"use client";

import { useActionState } from "react";

import { actionNewUser } from "../actions/user.mjs";

export default function NewUser() {
  const [state, dispatch] = useActionState(actionNewUser, {
    userCode: null,
  });

  return (
    <form action={dispatch}>
      <input type="submit" value="New User" />
      <br />
      {state.userCode ? "User code: " + state.userCode : ""}
    </form>
  );
}
