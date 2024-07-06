import { ClientOnly } from "@lazarv/react-server/client";
import Counter from "./counter.jsx";

export default function SinglePageApplication() {
  return (
    <html>
      <body>
        <ClientOnly>
          <Counter />
        </ClientOnly>
      </body>
    </html>
  );
}
