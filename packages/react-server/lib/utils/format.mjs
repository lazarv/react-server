export function formatDuration(duration) {
  return duration < 1000 ? `${duration}ms` : `${(duration / 1000).toFixed(2)}s`;
}
