export default function Link({ name, children }) {
  return (
    <div className="flex items-baseline">
      <span id={name} className="relative -top-32 lg:-top-20"></span>
      {children}
      <a
        href={`#${name}`}
        className="text-2xl ml-2 [h4+&]:text-lg [h4+&]:ml-1 [h3+&]:text-lg [h3+&]:ml-1"
      >
        #
      </a>
    </div>
  );
}
