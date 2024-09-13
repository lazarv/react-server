"use client";

import { BarChart } from "@mantine/charts";

import { data } from "./data";

export default function MyBarChart() {
  return (
    <BarChart
      h={300}
      data={data}
      dataKey="month"
      series={[
        { name: "Smartphones", color: "violet.6" },
        { name: "Laptops", color: "blue.6" },
        { name: "Tablets", color: "teal.6" },
      ]}
      tickLine="y"
    />
  );
}
