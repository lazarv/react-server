import { Link } from "@lazarv/react-server/navigation";

import MyRichTextEditor from "../components/MyRichTextEditor";

export default async function RtePage() {
  const data = await getData();

  return (
    <div>
      <title>{data.title}</title>
      <h1>{data.headline}</h1>
      <MyRichTextEditor />
      <Link to="/" className="mt-4 inline-block underline">
        Return home
      </Link>
    </div>
  );
}

const getData = async () => {
  const data = {
    title: "Ext / Rich text editor",
    headline: "Extentions / Rich text editor",
  };

  return data;
};

export const getConfig = async () => {
  return {
    render: "static",
  };
};
