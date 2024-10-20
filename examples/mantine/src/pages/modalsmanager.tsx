import MyModal from "../components/MyModal";

export default async function ModalsManagerPage() {
  const data = await getData();

  return (
    <div>
      <title>{data.title}</title>
      <h1>{data.headline}</h1>
      <MyModal />
    </div>
  );
}

const getData = async () => {
  const data = {
    title: "Ext / Modals manager",
    headline: "Extensions / Modals manager",
  };

  return data;
};
