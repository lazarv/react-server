function Time() {
  "use cache; profile=day";
  return <h1>{new Date().toISOString()}</h1>;
}

export default async function App() {
  return <Time />;
}
