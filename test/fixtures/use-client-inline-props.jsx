import { useState } from "react";

const shared = "shared";

function Badge({ label }) {
  "use client";
  return (
    <span data-testid="badge">
      {shared} {label}
    </span>
  );
}

function Input({ onChange, placeholder }) {
  "use client";
  const [value, setValue] = useState("");
  return (
    <input
      data-testid="input"
      placeholder={placeholder}
      value={value}
      onChange={(e) => {
        setValue(e.target.value);
        onChange?.(e.target.value);
      }}
    />
  );
}

export default function App() {
  const greeting = "hello";

  function Greeting({ name }) {
    "use client";
    return (
      <p data-testid="greeting">
        {greeting} {name}
      </p>
    );
  }

  const Display = ({ children, ...rest }) => {
    "use client";
    return (
      <div data-testid="display" {...rest}>
        {greeting} {children}
      </div>
    );
  };

  return (
    <html lang="en">
      <head>
        <title>Test</title>
      </head>
      <body>
        <Badge label="tag" />
        <Input placeholder="type here" />
        <Greeting name="world" />
        <Display title="box">content</Display>
      </body>
    </html>
  );
}
