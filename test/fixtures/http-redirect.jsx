import { redirect, useUrl } from "@lazarv/react-server";

export default function HttpHeadersPage() {
  const { pathname } = useUrl();
  if (pathname !== "/redirected") {
    redirect("/redirected");
  }
  return <p>Redirected</p>;
}
