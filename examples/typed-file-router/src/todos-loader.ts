/**
 * Shared todos data.
 *
 * Used by both server (pages/(server).todos.resource.ts) and client
 * (pages/(client).todos.resource.ts) resource files.
 */

export type Todo = { id: number; title: string; completed: boolean };

const TODOS: Todo[] = [
  { id: 1, title: "Set up file router", completed: true },
  { id: 2, title: "Add typed routes", completed: true },
  { id: 3, title: "Add resource files", completed: true },
  { id: 4, title: "Bind resources to routes", completed: true },
  { id: 5, title: "Add client-side caching", completed: false },
  { id: 6, title: "Write integration tests", completed: false },
  { id: 7, title: "Deploy to production", completed: false },
];

export async function loadTodos({ filter }: { filter: string }) {
  // Simulate network latency
  await new Promise((resolve) => setTimeout(resolve, 100));

  const items =
    filter === "all"
      ? TODOS
      : TODOS.filter((t) =>
          filter === "completed" ? t.completed : !t.completed
        );

  return {
    items,
    total: TODOS.length,
    fetchedAt: new Date().toISOString(),
  };
}
