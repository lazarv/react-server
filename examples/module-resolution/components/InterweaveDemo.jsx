import { Markup } from "interweave";
import { polyfill } from "interweave-ssr";

// Enable SSR support for interweave
polyfill();

export default function InterweaveDemo() {
  const htmlContent = "<strong>Bold text</strong> and <em>italic text</em>";

  return (
    <div data-testid="interweave-result">
      <p>interweave loaded successfully</p>
      <Markup content={htmlContent} />
    </div>
  );
}
