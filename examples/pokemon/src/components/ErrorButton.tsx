import clsx from "clsx";
import { twMerge } from "tailwind-merge";

export default function ErrorButton({
  className,
  children,
  ...props
}: React.PropsWithChildren<React.ButtonHTMLAttributes<HTMLButtonElement>>) {
  return (
    <button
      className={twMerge(
        clsx(
          "max-w-40 bg-red-500 text-white px-4 py-2 rounded focus:outline focus:outline-2 outline-red-500 outline-offset-2 hover:bg-red-600 hover:outline hover:outline-2",
          className
        )
      )}
      {...props}
      tabIndex={0}
    >
      {children}
    </button>
  );
}
