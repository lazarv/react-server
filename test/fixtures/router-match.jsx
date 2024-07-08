import { useMatch } from "@lazarv/react-server/router";

export default function Router() {
  const userParams = useMatch("/users/[userId]", {
    exact: true,
  });
  const userSlugParams = useMatch("/users/[userId]/[...slug]");
  const userOptionalSlugEditParams = useMatch(
    "/users/[userId]/[[...slug]]/edit",
    {
      exact: true,
    }
  );
  const userPatternParams = useMatch("/users-ext/USER-[userId]");
  const userMatcherParams = useMatch("/users-ext/MATCHER-[userId=number]", {
    matchers: {
      number: (value) => /^\d+$/.test(value),
    },
  });

  return (
    <>
      {userParams && <pre>/users/[userId] {JSON.stringify(userParams)}</pre>}
      {userSlugParams && (
        <pre>/users/[userId]/[...slug] {JSON.stringify(userSlugParams)}</pre>
      )}
      {userOptionalSlugEditParams && (
        <pre>
          /users/[userId]/[[...slug]]/edit{" "}
          {JSON.stringify(userOptionalSlugEditParams)}
        </pre>
      )}
      {userPatternParams && (
        <pre>/users-ext/USER-[userId] {JSON.stringify(userPatternParams)}</pre>
      )}
      {userMatcherParams && (
        <pre>
          /users-ext/MATCHER-[userId=number] {JSON.stringify(userMatcherParams)}
        </pre>
      )}
    </>
  );
}
