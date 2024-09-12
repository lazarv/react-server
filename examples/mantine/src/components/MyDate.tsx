"use client";

import { useState } from "react";

//import 'dayjs/locale/de';
import { DateInput } from "@mantine/dates";

export default function MyDate() {
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
