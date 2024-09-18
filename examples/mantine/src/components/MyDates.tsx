"use client";

import { useState } from "react";

import { Select } from "@mantine/core";
import { DateInput } from "@mantine/dates";
import dayjs from "dayjs";
import de from "dayjs/locale/de";

dayjs.locale(de);

export default function MyDates() {
  const [value, setValue] = useState<Date | null>(null);
  const [locale, setLocale] = useState("en");

  return (
    <>
      <Select
        data={[
          { value: "en", label: "English" },
          { value: "de", label: "German" },
        ]}
        value={locale}
        onChange={(value) => setLocale(value ?? "en")}
      />
      <DateInput
        locale={locale}
        value={value}
        onChange={setValue}
        label="Date input"
        placeholder="Date input"
      />
    </>
  );
}
