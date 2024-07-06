import { callActionProp, serverAction } from "./actions.mjs";
import { CallAction, CallActionImport } from "./call-action.jsx";

async function inlineServerActionTopLevel() {
  "use server";
  console.log("submitted inline-server-action-top-level!");
}

export default function ServerAction() {
  async function inlineServerAction() {
    "use server";
    console.log("submitted inline-server-action-function!");
  }

  const inlineServerActionArrow = async () => {
    "use server";
    console.log("submitted inline-server-action-arrow!");
  };

  return (
    <>
      <form
        action={async () => {
          "use server";
          console.log("submitted inline-jsx-prop!");
        }}
      >
        <button type="submit" data-testid="inline-jsx-prop">
          Submit
        </button>
      </form>
      <form action={inlineServerAction}>
        <button type="submit" data-testid="inline-server-action-function">
          Submit
        </button>
      </form>
      <form action={inlineServerActionArrow}>
        <button type="submit" data-testid="inline-server-action-arrow">
          Submit
        </button>
      </form>
      <form action={inlineServerActionTopLevel}>
        <button type="submit" data-testid="inline-server-action-top-level">
          Submit
        </button>
      </form>
      <form action={serverAction}>
        <button type="submit" data-testid="server-action">
          Submit
        </button>
      </form>
      <CallAction action={callActionProp} />
      <CallActionImport />
    </>
  );
}
