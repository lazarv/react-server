import { redirect } from "@lazarv/react-server";
import { getIronSession } from "iron-session";
import { cookieName, password } from "../misc/session";
import Cookies from "../misc/cookies";

export default function Logout() {
  return (
    <form
      action={async () => {
        "use server";
        const session = await getIronSession(new Cookies(), {
          cookieName,
          password,
        });
        delete session.username;
        session.destroy();
        redirect("/");
      }}
    >
      <input type="submit" value="Logout" />
    </form>
  );
}
