import { cookie, setCookie } from "@lazarv/react-server";

export default function HttpHeadersPage() {
  const { "cookie-name": cookieName } = cookie();
  setCookie(
    "cookie-name",
    cookieName === "cookie-value" ? "cookie-value-update" : "cookie-value"
  );
  return <p>Cookies</p>;
}
