"use client";

import { use } from "react";
import { ClientOnly } from "@lazarv/react-server/client";

function Greeting({ name }) {
  return <span className="greeting">Hello, {name}!</span>;
}

async function getCachedComponent() {
  "use cache: local; ttl=3000";
  const timestamp = new Date().toISOString();
  return (
    <div className="cached-component">
      <Greeting name="World" />
      <span className="timestamp">{timestamp}</span>
    </div>
  );
}

async function getCachedList() {
  "use cache: session; ttl=5000";
  const timestamp = new Date().toISOString();
  return (
    <ul className="cached-list">
      <li>Item A</li>
      <li>Item B</li>
      <li>Item C</li>
      <li className="list-timestamp">{timestamp}</li>
    </ul>
  );
}

const cachedComponent =
  typeof document !== "undefined" ? getCachedComponent() : null;
const cachedList = typeof document !== "undefined" ? getCachedList() : null;

function CachedContent() {
  return (
    <div id="cached-content">
      <div id="component-result">{use(cachedComponent)}</div>
      <div id="list-result">{use(cachedList)}</div>
    </div>
  );
}

export default function App() {
  return (
    <html lang="en" suppressHydrationWarning>
      <body suppressHydrationWarning>
        <ClientOnly>
          <CachedContent />
        </ClientOnly>
      </body>
    </html>
  );
}
