"use client";

import { useEffect, useRef } from "react";

export default function FormInput(
  props: React.InputHTMLAttributes<HTMLInputElement>
) {
  const timeoutId = useRef<number>();
  const formRef = useRef<HTMLFormElement | null>(null);
  const ref = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    formRef.current = ref?.current?.closest("form") ?? null;
  }, [ref]);

  const handleChange = () => {
    if (timeoutId.current) {
      clearTimeout(timeoutId.current);
    }

    timeoutId.current = setTimeout(() => {
      formRef.current?.requestSubmit();
    }, 200);
  };

  return <input {...props} ref={ref} onChange={handleChange} />;
}
