import { FileText } from "lucide-react";

import { useLanguage } from "../i18n.mjs";

export default function ViewMarkdown({ pathname }) {
  const lang = useLanguage();
  const canonical = pathname.replace(new RegExp(`^/${lang}`), "");

  // Don't show on the homepage or language root
  if (!canonical || canonical === "/") {
    return null;
  }

  const mdUrl = `${canonical}.md`;

  return (
    <a
      href={mdUrl}
      target="_blank"
      rel="noreferrer"
      title="View as Markdown (for AI/LLM usage)"
      className="flex items-center gap-1 text-xs text-gray-600 hover:!text-gray-500 dark:!text-gray-500 dark:hover:!text-gray-400 hover:no-underline absolute right-4 top-5 z-50"
    >
      <FileText size={12} />
      .md
    </a>
  );
}
