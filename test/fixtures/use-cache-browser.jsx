"use client";

import { use, useState, useEffect } from "react";
import { ClientOnly } from "@lazarv/react-server/client";

async function getLocalTime() {
  "use cache: local; ttl=1000";
  return new Date().toISOString();
}

async function getSessionTime() {
  "use cache: session; ttl=2000";
  return new Date().toISOString();
}

async function getIndexedDBTime() {
  "use cache: indexedb; ttl=3000";
  return new Date().toISOString();
}

async function getLRUTime() {
  "use cache: lru; ttl=4000";
  return new Date().toISOString();
}

const localTime = typeof document !== "undefined" ? getLocalTime() : null;
const sessionTime = typeof document !== "undefined" ? getSessionTime() : null;
const indexedDBTime =
  typeof document !== "undefined" ? getIndexedDBTime() : null;
const initialLRUTime = typeof document !== "undefined" ? getLRUTime() : null;

function Time() {
  const [lruTime, setLruTime] = useState(initialLRUTime);

  useEffect(() => {
    let isMounted = true;

    const timer = setInterval(async () => {
      const time = getLRUTime();
      if (isMounted) {
        setLruTime(time);
      }
    }, 500);

    return () => {
      isMounted = false;
      clearInterval(timer);
    };
  }, []);

  return (
    <pre>
      {JSON.stringify(
        {
          local: use(localTime),
          session: use(sessionTime),
          indexedb: use(indexedDBTime),
          lru: use(lruTime),
        },
        null,
        2
      )}
    </pre>
  );
}

export default function App() {
  return (
    <html lang="en" suppressHydrationWarning>
      <body suppressHydrationWarning>
        <ClientOnly>
          <Time />
        </ClientOnly>
      </body>
    </html>
  );
}
