import MySpotlight from "../components/MySpotlight";

export default async function SpotlightsPage() {
  const data = await getData();

  return (
    <div>
      <title>{data.title}</title>
      <h1>{data.headline}</h1>
      <MySpotlight />
    </div>
  );
}

const getData = async () => {
  const data = {
    title: "Ext / Spotlights",
    headline: "Extentions / Spotlights",
  };

  return data;
};
