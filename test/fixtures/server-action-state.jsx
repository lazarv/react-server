const state = { name: "" };
export default function ServerActionState() {
  return (
    <form
      action={async (formData) => {
        "use server";
        state.name = formData.get("name");
        console.log(`update name to ${state.name || "Anonymous"}`);
      }}
    >
      {state.name && <h1>Welcome, {state.name}!</h1>}
      <input type="text" name="name" defaultValue={state.name} />
      <button type="submit" data-testid="submit">
        Submit
      </button>
    </form>
  );
}
