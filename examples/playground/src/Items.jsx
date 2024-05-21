import { withCache, headers } from "@lazarv/react-server";
import { Link } from "@lazarv/react-server/navigation";
import { Suspense } from "react";

import Counter from "./Counter.jsx";

const items = new Array(10).fill(0).map((_, i) => i);

async function DolorSitAmet() {
  await new Promise((resolve) => setTimeout(resolve, 1500));
  return <pre>dolor sit amet</pre>;
}

async function AsyncComponent({ children }) {
  await new Promise((resolve) => setTimeout(resolve, 500));
  return (
    <div>
      <h3>Items Async Component</h3>
      <h4>{new Date().toISOString()}</h4>
      {children}
      <pre>{Promise.resolve("almafa")}</pre>
      <pre>
        {
          new Promise((resolve) =>
            setTimeout(() => resolve("Lorem ipsum..."), 500)
          )
        }
      </pre>
      <pre>
        {
          new Promise((resolve) =>
            setTimeout(() => resolve("Lorem ipsum 222..."), 1000)
          )
        }
      </pre>
      <DolorSitAmet />
    </div>
  );
}

export default withCache(async function App() {
  const inlineServerAction = function inlineServerAction() {
    "use server";
    console.log("inlineServerAction from items!");
  };
  headers({
    foobar: "foobar",
  });

  return (
    <>
      <main>Hello World!</main>
      <h3>{new Date().toISOString()}</h3>
      <form action={inlineServerAction}>
        <input type="submit" value="SERVER ACTION FROM ITEMS!" />
      </form>
      <Counter />
      {items.map((i) => (
        <div key={i}>Item #{i}</div>
      ))}
      <Suspense fallback={<div>Items async loading...</div>}>
        <AsyncComponent>
          <Counter />
        </AsyncComponent>
      </Suspense>
      <Link to="/items2">
        <button>Navigate to Items 2!</button>
      </Link>
    </>
  );
}, 30000);
