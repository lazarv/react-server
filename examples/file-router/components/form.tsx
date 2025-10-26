"use client";
import { useActionState } from "react";
import { useState } from "react";

import { createOrUpdateNote, Note } from "../actions";

export default function NoteForm({ note }: { note: Note }) {
  const [editedNote, setEditedNote] = useState(true);
  const [state, submitAction, isPending] = useActionState(createOrUpdateNote, {
    error: null,
  });
  return (
    <form action={submitAction}>
      {note?.id && <input type="hidden" name="id" value={note.id} />}
      <div>
        <label>
          Title:
          <input
            defaultValue={note.title}
            type="text"
            name="title"
            disabled={isPending}
          />
        </label>
      </div>
      <div>
        <label>
          Note:{" "}
          <input type="checkbox" onChange={() => setEditedNote(!editedNote)} />{" "}
          allow edit
          <textarea
            defaultValue={note.note}
            name="note"
            disabled={isPending || !editedNote}
          ></textarea>
        </label>
      </div>
      {state?.error?.map?.(({ message }, i) => (
        <p key={i} className="error">
          {message}
        </p>
      )) ??
        (state.error && <p className="error">{state.error?.toString()}</p>)}
      <div className="button-group">
        <a href="/forms" className="button">
          Cancel
        </a>
        <button type="submit" className="button primary" disabled={isPending}>
          Save Note
        </button>
      </div>
    </form>
  );
}
