/** Pure formatting helpers for the all-downloads panel. */

/** Human-readable byte size, e.g. 98123456 → "93.6 MB". Returns "" for non-positive input. */
export function formatBytes(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes <= 0) return ''
  const units = ['B', 'KB', 'MB', 'GB']
  let n = bytes
  let i = 0
  while (n >= 1024 && i < units.length - 1) {
    n /= 1024
    i++
  }
  const rounded = n >= 100 || i === 0 ? Math.round(n) : Number(n.toFixed(1))
  return `${rounded} ${units[i]}`
}
