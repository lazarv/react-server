async function getContributors() {
  "use cache";

  try {
    const res = await fetch(
      "https://api.github.com/repos/lazarv/react-server/contributors",
      {
        headers: {
          "User-Agent": "react-server.dev",
          Accept: "application/vnd.github.v3+json",
        },
      }
    );
    const data = await res.json();
    return data.filter((contributor) => contributor.login !== "lazarv");
  } catch {
    return [];
  }
}

export default async function Contributors() {
  const contributors = await getContributors();

  return (
    <div className="w-full my-8 flex flex-wrap gap-8 justify-center items-center">
      {contributors.map((contributor) => (
        <a
          key={contributor.login}
          href={`https://github.com/${contributor.login}`}
          target="_blank"
          rel="noopener noreferrer"
          className="flex flex-col items-center gap-2"
        >
          <img
            src={contributor.avatar_url}
            alt={contributor.login}
            className="w-24 h-24 rounded-full outline outline-4 outline-indigo-500 dark:outline-yellow-600"
          />
          <div className="text-sm font-semibold">{contributor.login}</div>
        </a>
      ))}
    </div>
  );
}
