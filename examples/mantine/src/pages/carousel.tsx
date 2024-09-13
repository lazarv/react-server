import MyCarousel from "../components/MyCarousel";

export default async function CarouselsPage() {
  const data = await getData();

  return (
    <div>
      <title>{data.title}</title>
      <h1>{data.headline}</h1>
      <MyCarousel />
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
