import { Link } from "@lazarv/react-server/navigation";

import MyDropzone from "../components/MyDropzone";

export default async function DropzonesPage() {
  const data = await getData();

  return (
    <div>
      <title>{data.title}</title>
      <h1>{data.headline}</h1>
      <MyDropzone />
      <Link to="/" className="mt-4 inline-block underline">
        Return home
      </Link>
    </div>
  );
}

const getData = async () => {
  const data = {
    title: "Ext / Dropzones",
    headline: "Extentions / Dropzones",
  };

  return data;
};

export const getConfig = async () => {
  return {
    render: "static",
  };
};
