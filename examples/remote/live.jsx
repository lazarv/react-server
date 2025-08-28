"use live";

import { randomUUID } from "node:crypto";

export default async function* Live({ children }) {
  yield (
    <div>
      <p>
        This component demonstrates live updates using a generator function. It
        will yield updates every 16ms for 100 iterations, then restart.
      </p>
      {children}
    </div>
  );
  await new Promise((resolve) => setTimeout(resolve, 3000));

  while (true) {
    for (let i = 0; i < 100; i++) {
      yield (
        <div>
          Live update <b>#{i}</b> {randomUUID()}
          {children}
        </div>
      );
      await new Promise((resolve) => setTimeout(resolve, 16));
    }
    await new Promise((resolve) => setTimeout(resolve, 1000));
    yield (
      <div>
        <b style={{ color: "blue" }}>LIVE UPDATE COMPLETE!</b>
        {children}
      </div>
    );
    await new Promise((resolve) => setTimeout(resolve, 1000));
    yield (
      <div>
        <b style={{ color: "red" }}>LIVE UPDATE RESTARTING...</b>
        {children}
      </div>
    );
    await new Promise((resolve) => setTimeout(resolve, 1000));
  }
}
