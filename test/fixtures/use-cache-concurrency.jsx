import { invalidate } from "@lazarv/react-server";

async function getTodos() {
  "use cache; ttl=10000; tags=todos";
  console.log("getTodos");
  await new Promise((resolve) => setTimeout(resolve, 500));
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
        invalidate(getTodos);
      }}
    >
      <button type="submit">Refresh</button>
      <pre>{JSON.stringify(todos, null, 2)}</pre>
    </form>
  );
}
