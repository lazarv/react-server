import { Link } from "@lazarv/react-server/navigation";

import MyCarousel from "../components/MyCarousel";

export default async function CarouselsPage() {
  const data = await getData();

  return (
    <div>
      <title>{data.title}</title>
      <h1>{data.headline}</h1>
      <MyCarousel />
      <Link to="/" className="mt-4 inline-block underline">
        Return home
      </Link>
    </div>
  );
}

const getData = async () => {
  const data = {
    title: "Ext / Carousels",
    headline: "Extentions / Carousels",
  };

  return data;
};

export const getConfig = async () => {
  return {
    render: "static",
  };
};
