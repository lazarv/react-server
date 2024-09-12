import { Link } from "@lazarv/react-server/navigation";

const getData = async () => {
  const data = {
    title: "About",
    headline: "About @lazarv/react-server",
    body: "The easiest way to build a React app with server-side rendering.",
  };

  return data;
};

export default async function AboutPage() {
  const data = await getData();

  return (
    <div>
      <title>{data.title}</title>
      <h1 className="text-4xl font-bold tracking-tight">{data.headline}</h1>
      <p>{data.body}</p>
      <Link to="/" className="mt-4 inline-block underline">
        Return home
      </Link>
    </div>
  );
}
