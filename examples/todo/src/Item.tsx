import { deleteTodo } from "./actions";

type Props = {
  id: number;
  title: string;
};
export default function Item({ id, title }: Props) {
  return (
    <div className="flex row items-center justify-between py-1 px-4 my-1 rounded-lg text-lg border bg-gray-100 text-gray-600 mb-2">
      <p className="flex-1">{title}</p>
      <form action={deleteTodo}>
        <input type="hidden" name="id" value={id} />
        <button className="font-medium">Delete</button>
      </form>
    </div>
  );
}
