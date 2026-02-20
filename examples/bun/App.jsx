import { redirect } from "@lazarv/react-server";
import { Database } from "bun:sqlite";
import Counter from "./Counter";

const db = new Database("kv.sqlite");
db.run("CREATE TABLE IF NOT EXISTS kv (key TEXT PRIMARY KEY, value TEXT)");

function kvGet(key) {
  const row = db.query("SELECT value FROM kv WHERE key = ?").get(key);
  return row ? JSON.parse(row.value) : null;
}

function kvSet(key, value) {
  db.run(
    "INSERT INTO kv (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = ?",
    key,
    JSON.stringify(value),
    JSON.stringify(value)
  );
}

async function incrementVisits() {
  "use server";
  const current = kvGet("visits") ?? 0;
  kvSet("visits", current + 1);
  redirect("/");
}

async function resetVisits() {
  "use server";
  kvSet("visits", 0);
  redirect("/");
}

export default async function App() {
  const visits = kvGet("visits") ?? 0;

  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        <meta charSet="utf-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <title>Bun SQLite KV Example</title>
      </head>
      <body suppressHydrationWarning>
        <h1>🐰 Bun + React Server</h1>
        <p>
          This example demonstrates using <strong>Bun's built-in SQLite</strong>{" "}
          as a key-value store in a React Server Component with server actions.
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
          <small>Bun version: {Bun.version}</small>
        </p>
      </body>
    </html>
  );
}
