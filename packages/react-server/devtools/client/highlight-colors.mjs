export const HIGHLIGHT_COLORS = [
  "rgba(99, 102, 241, 0.3)",
  "rgba(139, 92, 246, 0.3)",
  "rgba(236, 72, 153, 0.3)",
  "rgba(14, 165, 233, 0.3)",
  "rgba(20, 184, 166, 0.3)",
  "rgba(249, 115, 22, 0.3)",
  "rgba(234, 179, 8, 0.3)",
  "rgba(34, 197, 94, 0.3)",
];

export function pickColor(name) {
  let hash = 0;
  for (let i = 0; i < (name || "").length; i++) {
    hash = ((hash << 5) - hash + name.charCodeAt(i)) | 0;
  }
  return HIGHLIGHT_COLORS[Math.abs(hash) % HIGHLIGHT_COLORS.length];
}
