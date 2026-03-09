export default function PageMeta({ date, author, github, lang }) {
  if (!date && !author && !github) return null;

  return (
    <div className="flex flex-col items-end self-end gap-1 text-sm text-gray-500 dark:text-gray-400 mt-2 mb-6">
      {github ? (
        <a
          href={`https://github.com/${github}`}
          target="_blank"
          rel="noopener noreferrer"
          className="flex items-center gap-2 hover:text-gray-700 dark:hover:text-gray-300"
        >
          <img
            src={`https://github.com/${github}.png?size=48`}
            alt={author || github}
            className="w-6 h-6 rounded-full"
          />
          {author || github}
        </a>
      ) : author ? (
        <span>{author}</span>
      ) : null}
      {date ? (
        <time dateTime={date}>
          {new Date(date).toLocaleDateString(lang, {
            year: "numeric",
            month: "long",
            day: "numeric",
          })}
        </time>
      ) : null}
    </div>
  );
}
