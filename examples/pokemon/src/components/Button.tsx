import clsx from "clsx";
import { twMerge } from "tailwind-merge";

export default function Button({
  className,
  children,
  ...props
}: React.PropsWithChildren<React.ButtonHTMLAttributes<HTMLButtonElement>>) {
  return (
    <button
      className={twMerge(
        clsx(
          "w-20 p-2 bg-blue-500 text-white rounded-md disabled:opacity-50 disabled:outline-none disabled:bg-blue-500 focus:outline-2 outline-blue-500 outline-offset-2 hover:bg-blue-600 hover:outline hover:outline-2",
          className
        )
      )}
      type="button"
      {...props}
    >
      {children}
    </button>
  );
}
