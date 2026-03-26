import { message, source } from "react-server-condition-pkg";

export default function ReactServerCondition() {
  return (
    <div>
      <span id="message">{message}</span>
      <span id="source">{source}</span>
    </div>
  );
}
