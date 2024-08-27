import { Suspense } from "react";

async function Posts() {
  await new Promise((resolve) => setTimeout(resolve, 500));
  return (
    <ul className="list-disc pl-6 space-y-2">
      <li className="hover:text-blue-600 transition-colors">
        <h2 className="text-lg font-semibold">{`The Unexpected Journey of ${Math.random().toString(36).substring(7)}`}</h2>
        <p className="text-sm text-gray-600">{`Discover the twists and turns in this ${Math.random() < 0.5 ? "thrilling" : "heartwarming"} tale of ${Math.random() < 0.5 ? "adventure" : "self-discovery"}.`}</p>
      </li>
      <li className="hover:text-blue-600 transition-colors">
        <h2 className="text-lg font-semibold">{`Secrets of the ${Math.random() < 0.5 ? "Ancient" : "Modern"} ${Math.random().toString(36).substring(7)}`}</h2>
        <p className="text-sm text-gray-600">{`Uncover the mysteries hidden within ${Math.random() < 0.5 ? "forgotten ruins" : "bustling cities"} in this captivating exploration.`}</p>
      </li>
      <li className="hover:text-blue-600 transition-colors">
        <h2 className="text-lg font-semibold">{`The ${Math.random() < 0.5 ? "Rise" : "Fall"} of ${Math.random().toString(36).substring(7)}`}</h2>
        <p className="text-sm text-gray-600">{`A ${Math.random() < 0.5 ? "gripping" : "poignant"} narrative that ${Math.random() < 0.5 ? "challenges" : "inspires"} readers to reflect on the nature of ${Math.random() < 0.5 ? "power" : "humanity"}.`}</p>
      </li>
    </ul>
  );
}

export default function PostsLoader() {
  return (
    <div className="p-2">
      <Suspense fallback={"Loading..."}>
        <Posts />
      </Suspense>
    </div>
  );
}
