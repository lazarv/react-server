import { headers, useRender } from "@lazarv/react-server";

export default async function App() {
  const { lock } = useRender();

  await lock(async () => {
    await new Promise((resolve) => setTimeout(resolve, 100));
    headers({
      "x-wait": "works",
    });
  });

  const unlock = lock();
  await new Promise((resolve) => setTimeout(resolve, 100));
  headers({
    "x-suspend-resume": "works",
  });
  unlock();

  return <div>Hello World</div>;
}
