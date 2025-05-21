import { invalidate } from "@lazarv/react-server";

async function getTodos() {
  "use cache; ttl=5000; tags=todos";
  const res = await fetch("https://jsonplaceholder.typicode.com/todos");
  return {
    timestamp: Date.now(),
    data: await res.json(),
  };
}

export default async function App() {
  const todos = await getTodos();

  return (
    <form
      action={async () => {
        "use server";
        await invalidate(getTodos);
      }}
    >
      <button type="submit">Refresh</button>
      <pre>{JSON.stringify(todos, null, 2)}</pre>
    </form>
  );
}
