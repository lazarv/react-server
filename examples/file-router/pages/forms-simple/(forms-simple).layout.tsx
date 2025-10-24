export default function NotesLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div>
      <h1>Layout (forms simple)</h1>
      <div>{children}</div>
    </div>
  );
}
