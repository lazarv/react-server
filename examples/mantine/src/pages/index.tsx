import { Counter } from "../components/Counter";

export default async function HomePage() {
  const data = await getData();

  return (
    <div>
      <title>{data.title}</title>
      <h1 className="text-4xl font-bold tracking-tight">{data.headline}</h1>
      <p>{data.body}</p>

      <Counter />
      {/* <ComboBox /> */}
    </div>
  );
}

const getData = async () => {
  const data = {
    title: "@lazarv/react-server",
    headline: "Mantine UI example",
    body: "This is an example of how to use @lazarv/react-server with Mantine UI.",
  };

  return data;
};
