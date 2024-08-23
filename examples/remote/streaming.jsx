import { Refresh } from "@lazarv/react-server/navigation";
import { Suspense } from "react";

async function AsyncComponent() {
  await new Promise((resolve) => setTimeout(resolve, 500));
  return (
    <>
      <p>
        This is a remote component that is loaded using Suspense. -{" "}
        <b>{new Date().toISOString()}</b>
      </p>
      <Refresh local>
        <button>Refresh</button>
      </Refresh>
    </>
  );
}

export default function Streaming() {
  return (
    <div>
      <Suspense fallback={<p>Loading...</p>}>
        <AsyncComponent />
      </Suspense>
    </div>
  );
}
