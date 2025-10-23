export default function AuthLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div>
      <h1>Auth Layout</h1>
      <div>{children}</div>
    </div>
  );
}
