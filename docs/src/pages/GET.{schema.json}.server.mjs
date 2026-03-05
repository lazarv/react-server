import { generateJsonSchema } from "@lazarv/react-server/config";

export default function Schema() {
  const schema = generateJsonSchema();

  return new Response(JSON.stringify(schema, null, 2), {
    headers: {
      "Content-Type": "application/json",
    },
  });
}
