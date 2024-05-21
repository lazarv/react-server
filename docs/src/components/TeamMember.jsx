import GitHub from "../../public/github.svg?react";
import X from "../../public/x.svg?react";
import classes from "./TeamMember.module.css";

export default function TeamMember({ github, twitter, children }) {
  return (
    <div
      className={`${classes.root} flex-1 min-w-full max-w-md md:min-w-[calc(50%-4rem)] lg:min-w-[calc(33%-4rem)] flex flex-col items-center justify-center p-4 py-8 rounded-xl bg-gray-50 dark:bg-gray-800 text-center drop-shadow`}
    >
      {children}
      <div className="flex items-center justify-center gap-4">
        {github && (
          <a href={github} target="_blank" rel="noreferrer">
            <GitHub className="w-4 h-4" />
          </a>
        )}
        {twitter && (
          <a href={twitter} target="_blank" rel="noreferrer">
            <X className="w-4 h-4" />
          </a>
        )}
      </div>
    </div>
  );
}
