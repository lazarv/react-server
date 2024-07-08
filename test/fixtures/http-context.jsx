import { useHttpContext } from "@lazarv/react-server";

export default function HttpContextPage() {
  const context = useHttpContext();

  return (
    <div>
      <p>Method: {context.request.method}</p>
      <p>URL: {context.request.url.toString()}</p>
      <p>Request Headers: {context.request.headers?.get("accept")}</p>
    </div>
  );
}
