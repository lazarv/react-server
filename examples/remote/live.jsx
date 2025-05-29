"use live";

import { randomUUID } from "node:crypto";

export default async function* Live() {
  while (true) {
    for (let i = 0; i < 100; i++) {
      yield (
        <div>
          Live update <b>#{i}</b> {randomUUID()}
        </div>
      );
      await new Promise((resolve) => setTimeout(resolve, 16));
    }
    await new Promise((resolve) => setTimeout(resolve, 1000));
    yield (
      <div style={{ color: "blue" }}>
        <b>LIVE UPDATE COMPLETE!</b>
      </div>
    );
    await new Promise((resolve) => setTimeout(resolve, 1000));
    yield (
      <div style={{ color: "red" }}>
        <b>LIVE UPDATE RESTARTING...</b>
      </div>
    );
    await new Promise((resolve) => setTimeout(resolve, 1000));
  }
}
