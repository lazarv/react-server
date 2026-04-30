import { FileText } from "lucide-react";

import { defaultLanguage } from "../const.mjs";
import { useLanguage } from "../i18n.mjs";

export default function ViewMarkdown({ pathname }) {
  const lang = useLanguage();

  // English is canonical and lives at unprefixed URLs — `/en/...`
  // exists only as a non-canonical form that the i18n middleware
  // redirects to `/...`, so the `.md` link must strip `/en` to point
  // at the real artifact. Non-default languages (`/ja/...`) keep
  // their prefix because that's where their own translation is
  // emitted (`/ja/api/dev.md`, not `/api/dev.md`).
  const stripped = pathname.replace(
    new RegExp(`^/${defaultLanguage}(?=/|$)`),
    ""
  );

  // Hide on the homepage and bare language roots (`/`, `/ja`, `/ja/`).
  // Use the active language for this check so `/ja` collapses to ""
  // even though we don't strip it from the link itself.
  const visibilityPath = stripped.replace(new RegExp(`^/${lang}(?=/|$)`), "");
  if (!visibilityPath || visibilityPath === "/") {
    return null;
  }

  const mdUrl = `${stripped.replace(/\/$/, "")}.md`;

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
