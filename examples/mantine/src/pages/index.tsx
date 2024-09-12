import { Link } from "@lazarv/react-server/navigation";
import { Autocomplete, Button } from "@mantine/core";

import ComboBox from "../components/Combox";
import { Counter } from "../components/Counter";
import MyDate from "../components/MyDate";

export default async function HomePage() {
  const data = await getData();

  return (
    <div>
      <title>{data.title}</title>
      <h1 className="text-4xl font-bold tracking-tight">{data.headline}</h1>
      <p>{data.body}</p>
      <div>
        <Link to="/forms">Forms</Link> | <Link to="/charts">Charts</Link> |{" "}
        <Link to="/code">Code Highlights</Link> |{" "}
        <Link to="/notifications">Notifications</Link> |{" "}
        <Link to="/spotlights">Spotlights</Link> |{" "}
        <Link to="/carousels">Carousels</Link> |{" "}
        <Link to="/dropzones">Dropzones</Link> |{" "}
        <Link to="/navigationprogresses">Navigation Progresses</Link> |{" "}
        <Link to="/modalsmanager">Modals Manager</Link> |{" "}
        <Link to="/rte">Rich Text Editor</Link>
      </div>
      <Counter />
      <Link to="/about" className="mt-4 inline-block underline">
        About page
      </Link>
      <Button variant="contained">DEMO BUTTTON 2</Button>
      <ComboBox />
      <Autocomplete
        label="Your favorite library"
        placeholder="Pick value or enter anything"
        data={["LOCAL", "React", "Angular", "Vue", "Svelte"]}
      />
      <MyDate />
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
