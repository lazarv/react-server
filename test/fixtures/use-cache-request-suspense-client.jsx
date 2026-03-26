"use client";

import { use } from "react";
import { getSuspenseData } from "./use-cache-request-data.mjs";

export default function SuspenseClientDisplay() {
  const data = use(getSuspenseData());
  return (
    <div id="suspense-client">
      <div id="suspense-client-timestamp">{data.timestamp}</div>
      <div id="suspense-client-random">{data.random}</div>
    </div>
  );
}
