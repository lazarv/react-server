import RemoteButton from "./RemoteButton";
import "./remote.css";

const state = { name: "" };
export default () => {
  return (
    <>
      <h3>Hello, {state.name || "Anonymous"}!</h3>
      {state.name ? <p>It's nice to meet you!</p> : <p>What is your name?</p>}
      <form
        action={async (data) => {
          "use server";
          state.name = data.get("name");
        }}
      >
        <input type="text" name="name" defaultValue={state.name} />
        <button type="submit">Submit</button>
      </form>
      <RemoteButton />
    </>
  );
};
