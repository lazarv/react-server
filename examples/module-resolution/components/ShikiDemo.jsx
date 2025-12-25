import { codeToHtml } from "shiki";

export default async function ShikiDemo() {
  const code = `console.log("Hello from Shiki!");`;

  const html = await codeToHtml(code, {
    lang: "javascript",
    theme: "github-dark",
  });

  return (
    <div data-testid="shiki-result">
      <p>shiki loaded successfully</p>
      <div dangerouslySetInnerHTML={{ __html: html }} />
    </div>
  );
}
