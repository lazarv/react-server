import { Link } from "@lazarv/react-server/navigation";

import MyNavigationProgress from "../components/MyNavigationProgress";

export default async function NavigationProgressesPage() {
  const data = await getData();

  return (
    <div>
      <title>{data.title}</title>
      <h1>{data.headline}</h1>
      <MyNavigationProgress />
      <Link to="/" className="mt-4 inline-block underline">
        Return home
      </Link>
    </div>
  );
}

const getData = async () => {
  const data = {
    title: "Ext / NavigationsProgresses",
    headline: "Extentions / NavigationsProgresses",
  };

  return data;
};

export const getConfig = async () => {
  return {
    render: "static",
  };
};
