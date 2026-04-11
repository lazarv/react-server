import { z } from "zod";
import { user } from "@lazarv/react-server/routes";

export const route = "user";

export const validate = {
  params: z.object({ id: z.string().regex(/^\d+$/, "ID must be numeric") }),
};

export default user.createPage(({ id }) => {
  return (
    <div>
      <h1>User Profile</h1>
      <p>
        User ID: <strong>{id}</strong>
      </p>
      <p>
        The <code>id</code> param is validated via Zod to be numeric. Try
        navigating to <code>/user/abc</code> — it will fail validation.
      </p>
      <p>
        <user.Link params={{ id: "99" }}>Go to User 99</user.Link>
      </p>
    </div>
  );
});
