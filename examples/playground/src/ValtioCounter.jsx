"use client";

import { proxy, useSnapshot } from "valtio";

const state = proxy({ count: 0, text: "hello" });

// This will re-render on `state.count` change but not on `state.text` change
export default function ValtioCounter() {
  const snap = useSnapshot(state);

  return (
    <div>
      {snap.count}
      <button onClick={() => ++state.count}>+1</button>
    </div>
  );
}
