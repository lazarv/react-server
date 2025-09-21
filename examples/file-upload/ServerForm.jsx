import { useActionState } from "@lazarv/react-server/router";
import { reload } from "@lazarv/react-server";

export default function Form() {
  const modUploadFile = async (formData) => {
    "use server";
    reload("/");
    return formData.get("file")?.name;
  };
  const state = useActionState(modUploadFile);

  if (state.error) {
    throw state.error;
  }

  return (
    <>
      <pre>{JSON.stringify(state, null, 2)}</pre>
      <form action={modUploadFile}>
        <input type="file" name="file" />
        <button type="submit">Upload</button>
      </form>
    </>
  );
}
