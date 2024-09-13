import MyNavigationProgress from "../components/MyNavigationProgress";

export default async function NavigationProgressesPage() {
  const data = await getData();

  return (
    <div>
      <title>{data.title}</title>
      <h1>{data.headline}</h1>
      <MyNavigationProgress />
    </div>
  );
}

const getData = async () => {
  const data = {
    title: "Ext / NavigationsProgresses",
    headline: "Extentions / NavigationsProgresses",
  };

  return data;
};
