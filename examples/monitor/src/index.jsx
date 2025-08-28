import ResourceMonitor from "./ResourceMonitor";

export default function App() {
  return (
    <html
      lang="en"
      suppressHydrationWarning
      style={{ background: "black", color: "#ccc" }}
    >
      <body suppressHydrationWarning>
        <h1>Resource Monitor Example</h1>
        <ResourceMonitor />
      </body>
    </html>
  );
}
