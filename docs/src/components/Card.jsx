import classes from "./Card.module.css";

export default function Card({ children, ...props }) {
  return (
    <div
      className={`${classes.root} flex flex-col rounded-xl p-4 bg-gray-50 dark:bg-gray-800 text-xs drop-shadow`}
      {...props}
    >
      {children}
    </div>
  );
}
