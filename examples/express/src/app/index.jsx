import { useHttpContext } from "@lazarv/react-server";

import Counter from "./Counter";

export default function App() {
  const {
    platform: { request: req },
  } = useHttpContext();

  return (
    <html lang="en" suppressHydrationWarning>
      <body suppressHydrationWarning>
        <h1>Hello World!</h1>
        <p>My random number for today is {Math.random()}</p>
        <Counter />
        <p>User: {req?.user?.id}</p>
      </body>
    </html>
  );
}
