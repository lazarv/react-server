export default function App() {
  return (
    <>
      <h1>Define</h1>
      <pre>__APP_ENV__: {__APP_ENV__}</pre>
      <h1>process.env</h1>
      <pre>{JSON.stringify(process.env, null, 2)}</pre>
      <h1>import.meta.env</h1>
      <pre>{JSON.stringify(import.meta.env, null, 2)}</pre>
    </>
  );
}
