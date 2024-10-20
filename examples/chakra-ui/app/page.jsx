import { Suspense } from "react";

import { AlertButton, Spinner } from "./Chakra";

async function AsyncComponent() {
  await new Promise((resolve) => setTimeout(resolve, 500));
  return null;
}

export default function Page() {
  return (
    <Suspense fallback={<Spinner />}>
      <AsyncComponent />
      <AlertButton>Hello Chakra UI!</AlertButton>
    </Suspense>
  );
}
