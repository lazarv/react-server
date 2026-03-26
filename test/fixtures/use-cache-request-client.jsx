"use client";

import { use } from "react";
import { getRequestData } from "./use-cache-request-data.mjs";

export default function ClientDisplay() {
  const data = use(getRequestData());
  return (
    <div id="client">
      <div id="client-timestamp">{data.timestamp}</div>
      <div id="client-random">{data.random}</div>
      <div id="client-type">
        {data.createdAt instanceof Date ? "Date" : typeof data.createdAt}
      </div>
    </div>
  );
}
