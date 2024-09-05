"use client";

import { Button } from "@mantine/core";

export default function Home() {
  return (
    <div>
      <h1>Home</h1>
      <Button onClick={() => alert("Hello Mantine!")}>Hello Mantine!</Button>
    </div>
  );
}
