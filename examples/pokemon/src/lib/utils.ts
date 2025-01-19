import { useUrl } from "@lazarv/react-server";

export function applySearchParams(params: Record<string, unknown>) {
  const { searchParams } = useUrl();
  const newSearchParams = new URLSearchParams(searchParams);
  for (const [key, value] of Object.entries(params)) {
    if (Array.isArray(value)) {
      value.forEach((v) => newSearchParams.append(key, v));
    } else {
      newSearchParams.set(key, value as string);
    }
  }
  return newSearchParams.toString();
}
