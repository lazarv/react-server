import MyDropzone from "../components/MyDropzone";

export default async function DropzonesPage() {
  const data = await getData();

  return (
    <div>
      <title>{data.title}</title>
      <h1>{data.headline}</h1>
      <MyDropzone />
    </div>
  );
}

const getData = async () => {
  const data = {
    title: "Ext / Dropzone",
    headline: "Extentions / Dropzone",
  };

  return data;
};
