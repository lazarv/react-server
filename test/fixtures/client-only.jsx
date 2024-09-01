import { ClientOnly } from "@lazarv/react-server/client";

import Counter from "./counter.jsx";

export default function SinglePageApplication() {
  return (
    <ClientOnly>
      <Counter />
    </ClientOnly>
  );
}
