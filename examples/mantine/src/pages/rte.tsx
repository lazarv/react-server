import "@mantine/tiptap/styles.css";

import MyRichTextEditor from "../components/MyRichTextEditor";

export default async function RtePage() {
  const data = await getData();

  return (
    <div>
      <title>{data.title}</title>
      <h1>{data.headline}</h1>
      <MyRichTextEditor />
    </div>
  );
}

const getData = async () => {
  const data = {
    title: "Ext / Rich text editor",
    headline: "Extensions / Rich text editor",
  };

  return data;
};
