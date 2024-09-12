import MyDates from "../components/MyDates";

export default async function DatesPage() {
  const data = await getData();

  return (
    <div>
      <title>{data.title}</title>
      <h1>{data.headline}</h1>
      <MyDates />
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
