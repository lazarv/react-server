import "./index.css";

import { allTodos } from "./actions";
import AddTodo from "./AddTodo";
import Item from "./Item";
import Layout from "./Layout";

export default async function Index() {
  const todos = allTodos();

  return (
    <Layout>
      <AddTodo />
      {todos.length === 0 && <p className="text-gray-500">No todos yet!</p>}
      {todos.map((todo) => (
        <Item key={todo.id} title={todo.title} id={todo.id} />
      ))}
    </Layout>
  );
}
