"use client";

import { use } from "react";
import { getNoHydrateData } from "./use-cache-request-data.mjs";

export default function NoHydrateClient() {
  const data = use(getNoHydrateData());
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
