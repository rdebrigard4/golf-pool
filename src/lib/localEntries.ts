function key(tournamentId: string): string {
  return `golf-pool:entries:${tournamentId}`
}

export function loadMyEntryIds(tournamentId: string): string[] {
  try {
    const raw = localStorage.getItem(key(tournamentId))
    if (!raw) return []
    const parsed = JSON.parse(raw)
    return Array.isArray(parsed) ? parsed.filter((x) => typeof x === 'string') : []
  } catch {
    return []
  }
}

export function saveMyEntryId(tournamentId: string, entryId: string): void {
  const ids = loadMyEntryIds(tournamentId)
  if (ids.includes(entryId)) return
  ids.push(entryId)
  localStorage.setItem(key(tournamentId), JSON.stringify(ids))
}

export function forgetMyEntryId(tournamentId: string, entryId: string): void {
  const ids = loadMyEntryIds(tournamentId).filter((id) => id !== entryId)
  localStorage.setItem(key(tournamentId), JSON.stringify(ids))
}
