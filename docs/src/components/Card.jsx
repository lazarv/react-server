import classes from "./Card.module.css";

export default function Card({ children, ...props }) {
  return (
    <div
      className={`${classes.root} flex flex-col rounded-xl p-4 bg-gray-50 dark:bg-gray-800 text-xs shadow-lg dark:shadow-[rgba(255,255,255,0.1)] border border-gray-500`}
      {...props}
    >
      {children}
    </div>
  );
}
