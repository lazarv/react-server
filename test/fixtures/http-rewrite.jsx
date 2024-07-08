import { rewrite, useUrl } from "@lazarv/react-server";

export function init$() {
  return async () => {
    const { pathname } = useUrl();
    if (pathname !== "/rewrite") {
      rewrite("/rewrite");
    }
  };
}

export default function HttpRewritePage() {
  const { pathname } = useUrl();
  return <p>{pathname}</p>;
}
