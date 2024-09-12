"use client";

import { useState } from "react";

import { Autocomplete } from "@mantine/core";

export default function ComboBox() {
  const [value, setValue] = useState<string>("");
  return (
    <>
      <Autocomplete
        value={value}
        onChange={setValue}
        label="Your favorite library"
        placeholder="Pick value or enter anything"
        data={["React", "Angular", "Vue", "Svelte"]}
      />
    </>
  );
}
