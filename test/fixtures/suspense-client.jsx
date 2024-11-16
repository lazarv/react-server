import { Suspense } from "react";
import ClientComponent from "./client-component.jsx";

async function AsyncComponent() {
  await new Promise((resolve) => setTimeout(resolve, 100));
  return <ClientComponent />;
}

export default function App() {
  return (
    <div>
      <Suspense fallback={<div>Loading...</div>}>
        <AsyncComponent />
      </Suspense>
    </div>
  );
}
