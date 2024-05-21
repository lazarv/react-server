import "./styles.css";

import { useUrl } from "@lazarv/react-server";
import { ClientOnly } from "@lazarv/react-server/client";
import ErrorBoundary from "@lazarv/react-server/error-boundary";
import { useCache } from "@lazarv/react-server/memory-cache";
import { Link, Refresh } from "@lazarv/react-server/navigation";
import { readFile } from "fs/promises";
import { Suspense, use } from "react";

import ActionButton from "./ActionButton";
import { serverAction, state } from "./actions.mjs";
import CheckError from "./CheckError.jsx";
import ClickAway from "./ClickAway.jsx";
import ClientProvider from "./ClientContext.jsx";
import ClientError from "./ClientError.jsx";
import Counter from "./Counter.jsx";
import { delay } from "./delay.mjs";
import FormState from "./FormState";
import InternalServerError from "./InternalServerError.jsx";
import IsClient from "./IsClient.jsx";
import { LanguageProvider, Language, useLang } from "./Lang.jsx";
import RefreshWithError from "./RefreshWithError.jsx";
import ValtioCounter from "./ValtioCounter.jsx";

function AsyncComponent() {
  use(delay(500));
  return <div>Async Component</div>;
}

function ThrowError() {
  use(delay(200));
  if (Math.random() > 0.75) throw new Error("Error!");
  return <span style={{ color: "blue" }}>No error</span>;
}

function AppSourceCode() {
  return (
    <pre style={{ width: "500px" }}>
      {use(
        delay(500).then(() =>
          useCache(["./src/App.jsx"], () => readFile("./src/App.jsx", "utf-8"))
        )
      )}
    </pre>
  );
}

export default async function App({
  inlineServerAction = async (formData) => {
    "use server";
    const { data, ...rest } =
      formData instanceof FormData ? Object.fromEntries(formData) : formData;
    console.log("Inline server action!", data, rest);
    await delay(500);
    return Math.random();
  },
}) {
  await delay(500);

  if (Math.random() > 1) {
    throw Object.assign(new Error("Error!"), { status: 418 });
  }
  const { pathname } = useUrl();

  return (
    <ErrorBoundary component={InternalServerError}>
      <LanguageProvider value="hu">
        <ClientError />
        <h1>Hello World!</h1>
        <h2>from {pathname}</h2>
        <h3>{new Date().toISOString()}</h3>
        <form action={inlineServerAction}>
          <input type="submit" value="SERVER ACTION!" />
        </form>
        <form>
          <input type="hidden" name="foo" value="bar" />
          <button formAction={inlineServerAction}>
            SERVER ACTION from client with event!
          </button>
        </form>
        <ActionButton
          action={inlineServerAction}
          data={{ foo: "bar" }}
          json={true}
        >
          SERVER ACTION from client with data!
        </ActionButton>
        <FormState
          action={async (prevState, formData) => {
            "use server";
            console.log(
              "Inline server action with form state!",
              prevState,
              formData
            );
            await delay(500);
            return { ...prevState, random: Math.random() };
          }}
        />
        <form action={serverAction}>
          <span>State value:</span> <pre>{state.value}</pre>
          <input type="text" name="name" />
          <input type="file" name="file1" />
          <input type="file" name="file2" />
          <input type="submit" value="Submit" />
        </form>
        <ClickAway>
          <h1>Click Away!</h1>
        </ClickAway>
        {/* TODO: <RemoteComponent
        url="http://localhost:3000/items"
        ttl={0}
        outlet="items"
      /> */}
        {/* <Refresh outlet="items">
          <button>Refresh items</button>
        </Refresh> */}
        <Link to="/items">
          <button>Navigate to Items</button>
        </Link>
        {/* <div>
          <Link to="/items2" target="items">
            <button>Navigate items to Items2</button>
          </Link>
          <Link to="/items" target="items">
            <button>Navigate items to Items</button>
          </Link>
        </div> */}
        <p>
          Server language?{" "}
          <span style={{ color: "blue" }}>
            <Language />
          </span>
        </p>
        <Counter />
        <ClientOnly>
          <ValtioCounter />
        </ClientOnly>
        <RefreshWithError>
          <button>Refresh</button>
        </RefreshWithError>
        <ErrorBoundary fallback={<CheckError />} component={CheckError}>
          <CheckError>
            <ThrowError />
          </CheckError>
        </ErrorBoundary>
        <ClientProvider>
          <p>
            Am I a client or a server?{" "}
            <span style={{ color: "red" }}>
              <IsClient>
                <Language />
              </IsClient>
            </span>
          </p>
        </ClientProvider>
        <div style={{ overflow: "hidden" }}>
          <div
            style={{
              animation: "marquee 10s linear infinite",
            }}
          >
            Lorem ipsum dolor sit amet, consectetur adipiscing elit.
          </div>
        </div>
        <h3>{new Date().toISOString()}</h3>
        <Suspense fallback={<div>Loading...</div>}>
          <AppSourceCode />
        </Suspense>
        <Suspense fallback={<div>Loading...</div>}>
          <AsyncComponent />
        </Suspense>
      </LanguageProvider>
    </ErrorBoundary>
  );
}
