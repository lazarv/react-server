import { getIronSession } from "iron-session";

import Login from "./components/login";
import Logout from "./components/logout";
import NewUser from "./components/newuser";
import Cookies from "./misc/cookies";
import { cookieName, password } from "./misc/session";

export default async function App() {
  const session = await getIronSession(new Cookies(), { cookieName, password });

  return (
    <div>
      {session.username ? (
        <Logout />
      ) : (
        <>
          <Login />
          <NewUser />
        </>
      )}
    </div>
  );
}
