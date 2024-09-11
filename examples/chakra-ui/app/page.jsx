import { Suspense } from "react";

import { Button, Spinner } from "./Chakra";

async function AsyncComponent() {
  await new Promise((resolve) => setTimeout(resolve, 1000));
  return null;
}

export default function Page() {
  return (
    <Suspense fallback={<Spinner />}>
      <AsyncComponent />
      <Button>Hello Chakra UI!</Button>
    </Suspense>
  );
}
