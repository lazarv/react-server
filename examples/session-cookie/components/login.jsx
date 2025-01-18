import { redirect } from "@lazarv/react-server";
import { getIronSession } from "iron-session";
import { cookieName, password } from "../misc/session";
import Cookies from "../misc/cookies";

export default function Login() {
  return (
    <form
      action={async () => {
        "use server";
        const session = await getIronSession(new Cookies(), {
          cookieName,
          password,
        });
        session.username = "test";
        await session.save();
        redirect("/");
      }}
    >
      <input type="submit" value="Login" />
    </form>
  );
}
