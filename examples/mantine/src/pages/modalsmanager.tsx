import { Link } from "@lazarv/react-server/navigation";

import MyModal from "../components/MyModal";

export default async function ModalsManagerPage() {
  const data = await getData();

  return (
    <div>
      <title>{data.title}</title>
      <h1>{data.headline}</h1>
      <MyModal />
      <Link to="/" className="mt-4 inline-block underline">
        Return home
      </Link>
    </div>
  );
}

const getData = async () => {
  const data = {
    title: "Ext / Modals manager",
    headline: "Extentions / Modals manager",
  };

  return data;
};

export const getConfig = async () => {
  return {
    render: "static",
  };
};
