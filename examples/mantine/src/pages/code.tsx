import { Link } from "@lazarv/react-server/navigation";

import MyCodeHighlight from "../components/MyCodeHighlight";

export default async function FormsPage() {
  const data = await getData();

  return (
    <div>
      <title>{data.title}</title>
      <h1>{data.headline}</h1>
      <MyCodeHighlight />
      <Link to="/" className="mt-4 inline-block underline">
        Return home
      </Link>
    </div>
  );
}

const getData = async () => {
  const data = {
    title: "Ext / CodeHighlight",
    headline: "Extentions / CodeHighlight",
  };

  return data;
};
