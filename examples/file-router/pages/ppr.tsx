import { Suspense } from "react";

import { setTimeout } from "timers/promises";

async function AsyncComponent() {
  "use dynamic";
  await setTimeout(1000);
  return <p>This component was loaded asynchronously after 1 second.</p>;
}

async function StaticComponent() {
  "use static";
  await setTimeout(1000);
  return <p>This component was statically pre-rendered at build time.</p>;
}

export default async function PprPage() {
  return (
    <div>
      <h1>Partial Pre-rendering</h1>
      <p>
        This page demonstrates partial pre-rendering in the file-based routing
        example.
      </p>
      <StaticComponent />
      <Suspense fallback={<p>Loading async component...</p>}>
        <AsyncComponent />
      </Suspense>
    </div>
  );
}
