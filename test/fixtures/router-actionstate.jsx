import { useActionState } from "@lazarv/react-server/router";

async function formAction(formData) {
  "use server";

  if (formData.get("username") === "John Doe") {
    console.log("Success!");
    return { success: true };
  } else {
    throw new Error("Unauthorized");
  }
}

export default function ActionState() {
  const { formData, data, error, actionId } = useActionState(formAction);

  return (
    <>
      <form action={formAction}>
        <input
          type="text"
          name="username"
          defaultValue={formData?.get("username") ?? ""}
        />
        <input type="submit" value="Submit" />
      </form>
      {data && <pre>{JSON.stringify(data)}</pre>}
      {error && <div>{error.message}</div>}
    </>
  );
}
