import { redirect } from "@lazarv/react-server";
import Counter from "./Counter";

const kv = await Deno.openKv();

async function incrementVisits() {
  "use server";
  const current = (await kv.get(["visits"])).value ?? 0;
  await kv.set(["visits"], current + 1);
  redirect("/");
}

async function resetVisits() {
  "use server";
  await kv.set(["visits"], 0);
  redirect("/");
}

export default async function App() {
  const visits = (await kv.get(["visits"])).value ?? 0;

  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        <meta charSet="utf-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <title>Deno KV Example</title>
      </head>
      <body suppressHydrationWarning>
        <h1>🦕 Deno + React Server</h1>
        <p>
          This example demonstrates using <strong>Deno KV</strong> in a React
          Server Component with server actions.
        </p>
        <p>
          Page visits: <strong>{visits}</strong>
        </p>
        <form action={incrementVisits}>
          <button type="submit">+1 Visit</button>
        </form>
        <form action={resetVisits}>
          <button type="submit">Reset</button>
        </form>
        <Counter />
        <hr />
        <p>
          <small>
            Deno version: {Deno.version.deno} &middot; V8: {Deno.version.v8}{" "}
            &middot; TypeScript: {Deno.version.typescript}
          </small>
        </p>
      </body>
    </html>
  );
}
