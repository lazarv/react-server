import { getIronSession } from "iron-session";

import { cookie, setCookie } from "@lazarv/react-server";

// Adapter to make the framework's cookie API compatible with iron-session
function createCookieAdapter() {
  return {
    get(name) {
      const value = cookie()[name];
      return value ? { name, value } : undefined;
    },
    set(name, value, options = {}) {
      setCookie(name, value, options);
    },
  };
}

export default async function IronSessionDemo() {
  const cookies = createCookieAdapter();

  const session = await getIronSession(cookies, {
    cookieName: "test-session",
    password: "complex_password_at_least_32_characters_long",
  });

  return (
    <div data-testid="iron-session-result">
      <p>iron-session loaded successfully</p>
      <p>Session type: {typeof session}</p>
    </div>
  );
}
