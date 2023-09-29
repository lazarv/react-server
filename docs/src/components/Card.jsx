export default function Card({ children, ...props }) {
  return (
    <div
      className="rounded-xl p-4 bg-gray-50 text-xs [&>h4]:m-0 [&>h5]:font-normal [&>img]:w-12 [&>img]:h-12 [&>img]:bg-white [&>img]:rounded-lg [&>img]:mb-2 [&>img]:border [&>img]:p-1 [&>p]:text-xs"
      {...props}
    >
      {children}
    </div>
  );
}
