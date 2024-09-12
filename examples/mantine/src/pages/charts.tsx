import { Link } from "@lazarv/react-server/navigation";

import MyAreaChart from "../components/charts/AreaChart/MyAreaChart";
import MyLineChart from "../components/charts/LineChart/MyLineChart";

export default async function ChartsPage() {
  const data = await getData();

  return (
    <div>
      <title>{data.title}</title>
      <h1>{data.headline}</h1>
      <MyAreaChart />
      <MyLineChart />
      <Link to="/" className="mt-4 inline-block underline">
        Return home
      </Link>
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
