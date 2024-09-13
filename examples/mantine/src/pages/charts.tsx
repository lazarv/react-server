import { ClientOnly } from "@lazarv/react-server/client";

import MyAreaChart from "../components/charts/AreaChart/MyAreaChart";
import MyBarChart from "../components/charts/BarChart/MyBarChart";
import MyLineChart from "../components/charts/LineChart/MyLineChart";

export default async function ChartsPage() {
  const data = await getData();

  return (
    <div>
      <title>{data.title}</title>
      <h1>{data.headline}</h1>
      <div>
        <h2>Area Chart</h2>
        <ClientOnly>
          <MyAreaChart />
        </ClientOnly>
      </div>
      <div>
        <h2>Bar Chart</h2>
        <MyBarChart />
      </div>
      <div>
        <h2>Bar Chart</h2>
        <MyLineChart />
      </div>
    </div>
  );
}

const getData = async () => {
  const data = {
    title: "Charts",
    headline: "Mantine Charts",
  };

  return data;
};
