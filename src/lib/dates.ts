export function formatCountdown(target: Date, now: Date = new Date()): string {
  const ms = target.getTime() - now.getTime()
  if (ms <= 0) return 'Starting now'
  const days = Math.floor(ms / 86400000)
  const hours = Math.floor((ms % 86400000) / 3600000)
  const minutes = Math.floor((ms % 3600000) / 60000)
  if (days > 0) return `${days}d ${hours}h ${minutes}m`
  if (hours > 0) return `${hours}h ${minutes}m`
  return `${minutes}m`
}

export function isLocked(t: { firstTeeTime: string; lockedManually: boolean }, now: Date = new Date()): boolean {
  if (t.lockedManually) return true
  return new Date(t.firstTeeTime).getTime() <= now.getTime()
}
