import { Form } from "@lazarv/react-server/navigation";
import { useSearchParams } from "@lazarv/react-server";

export default function RemoteForm({ initialName = "Anonymous", children }) {
  const { name } = useSearchParams();

  return (
    <>
      <p>Hello, {name || initialName}!</p>
      <Form local>
        <input type="text" name="name" defaultValue={name} />
        <button type="submit">Submit</button>
      </Form>
      {children}
    </>
  );
}
