"use client";

import "dayjs/locale/de";

import { useState } from "react";

import { DateInput } from "@mantine/dates";

export default function MyDates() {
  const [value, setValue] = useState<Date | null>(null);
  return (
    <DateInput
      //locale="de"
      value={value}
      onChange={setValue}
      label="Date input"
      placeholder="Date input"
    />
  );
}
