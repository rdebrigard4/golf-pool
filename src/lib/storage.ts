import {
  addDoc,
  collection,
  deleteDoc,
  deleteField,
  doc,
  getDoc,
  getDocs,
  onSnapshot,
  query,
  setDoc,
  updateDoc,
  where,
} from 'firebase/firestore'
import { db } from '../firebase'
import type { Entry, GolferScore, Tournament } from '../types'

export function subscribeActiveTournament(
  onChange: (t: Tournament | null) => void,
): () => void {
  const q = query(collection(db, 'tournaments'), where('isActive', '==', true))
  return onSnapshot(
    q,
    (snap) => {
      if (snap.empty) {
        onChange(null)
        return
      }
      const d = snap.docs[0]
      onChange({ id: d.id, ...(d.data() as Omit<Tournament, 'id'>) })
    },
    (err) => console.error('subscribeActiveTournament:', err),
  )
}

export function subscribeEntries(
  tournamentId: string,
  onChange: (entries: Entry[]) => void,
): () => void {
  const q = query(
    collection(db, 'entries'),
    where('tournamentId', '==', tournamentId),
  )
  return onSnapshot(
    q,
    (snap) => {
      const entries: Entry[] = []
      snap.forEach((d) => entries.push({ id: d.id, ...(d.data() as Omit<Entry, 'id'>) }))
      entries.sort((a, b) => a.submittedAt.localeCompare(b.submittedAt))
      onChange(entries)
    },
    (err) => console.error('subscribeEntries:', err),
  )
}

// Golfer scores come from a SINGLE aggregate `liveScores/{tournamentId}` doc
// written by the cron fetcher (scripts/fetch-live-scores.mjs), merged with a
// SINGLE `scoreOverrides/{tournamentId}` doc holding manual admin corrections.
// Reading two docs (instead of one doc per golfer) keeps client reads flat as
// the entrant count grows, and manual overrides win per-golfer.
function mergeScores(
  live: GolferScore[],
  overrides: Record<string, GolferScore>,
): GolferScore[] {
  const byName = new Map<string, GolferScore>()
  for (const g of live) byName.set(g.name, g)
  for (const g of Object.values(overrides)) byName.set(g.name, g)
  return [...byName.values()]
}

export function subscribeGolferScores(
  tournamentId: string,
  onChange: (scores: GolferScore[]) => void,
): () => void {
  let live: GolferScore[] = []
  let overrides: Record<string, GolferScore> = {}
  const emit = () => onChange(mergeScores(live, overrides))

  const unsubLive = onSnapshot(
    doc(db, 'liveScores', tournamentId),
    (snap) => {
      live = snap.exists() ? ((snap.data().golfers as GolferScore[]) ?? []) : []
      emit()
    },
    (err) => console.error('subscribeGolferScores/live:', err),
  )
  const unsubOverrides = onSnapshot(
    doc(db, 'scoreOverrides', tournamentId),
    (snap) => {
      overrides = snap.exists()
        ? ((snap.data().golfers as Record<string, GolferScore>) ?? {})
        : {}
      emit()
    },
    (err) => console.error('subscribeGolferScores/overrides:', err),
  )
  return () => {
    unsubLive()
    unsubOverrides()
  }
}

export async function listPastTournaments(): Promise<Tournament[]> {
  const q = query(collection(db, 'tournaments'), where('isComplete', '==', true))
  const snap = await getDocs(q)
  const items: Tournament[] = []
  snap.forEach((d) => items.push({ id: d.id, ...(d.data() as Omit<Tournament, 'id'>) }))
  items.sort((a, b) => b.year - a.year || b.firstTeeTime.localeCompare(a.firstTeeTime))
  return items
}

export async function getTournament(id: string): Promise<Tournament | null> {
  const snap = await getDoc(doc(db, 'tournaments', id))
  if (!snap.exists()) return null
  return { id: snap.id, ...(snap.data() as Omit<Tournament, 'id'>) }
}

export async function listEntries(tournamentId: string): Promise<Entry[]> {
  const q = query(collection(db, 'entries'), where('tournamentId', '==', tournamentId))
  const snap = await getDocs(q)
  const items: Entry[] = []
  snap.forEach((d) => items.push({ id: d.id, ...(d.data() as Omit<Entry, 'id'>) }))
  return items
}

export async function listGolferScores(tournamentId: string): Promise<GolferScore[]> {
  const [liveSnap, ovSnap] = await Promise.all([
    getDoc(doc(db, 'liveScores', tournamentId)),
    getDoc(doc(db, 'scoreOverrides', tournamentId)),
  ])
  const live = liveSnap.exists() ? ((liveSnap.data().golfers as GolferScore[]) ?? []) : []
  const overrides = ovSnap.exists()
    ? ((ovSnap.data().golfers as Record<string, GolferScore>) ?? {})
    : {}
  return mergeScores(live, overrides)
}

export async function saveTournament(t: Tournament): Promise<void> {
  const { id, ...rest } = t
  await setDoc(doc(db, 'tournaments', id), rest, { merge: true })
}

export async function activateTournament(id: string): Promise<void> {
  const q = query(collection(db, 'tournaments'), where('isActive', '==', true))
  const snap = await getDocs(q)
  for (const d of snap.docs) {
    if (d.id !== id) await updateDoc(d.ref, { isActive: false })
  }
  await updateDoc(doc(db, 'tournaments', id), { isActive: true })
}

export async function updateTournament(
  id: string,
  partial: Partial<Tournament>,
): Promise<void> {
  await updateDoc(doc(db, 'tournaments', id), partial)
}

export async function createEntry(entry: Omit<Entry, 'id'>): Promise<string> {
  const ref = await addDoc(collection(db, 'entries'), entry)
  return ref.id
}

export async function updateEntry(id: string, partial: Partial<Entry>): Promise<void> {
  await updateDoc(doc(db, 'entries', id), partial)
}

// Write an entry at a known doc id (used by the CSV importer, which keys on
// email+team so re-imports overwrite cleanly instead of duplicating).
export async function setEntry(id: string, entry: Omit<Entry, 'id'>): Promise<void> {
  await setDoc(doc(db, 'entries', id), entry, { merge: true })
}

export async function deleteEntry(id: string): Promise<void> {
  await deleteDoc(doc(db, 'entries', id))
}

export async function findEntryByEmail(
  tournamentId: string,
  email: string,
): Promise<Entry | null> {
  const q = query(
    collection(db, 'entries'),
    where('tournamentId', '==', tournamentId),
    where('email', '==', email.toLowerCase().trim()),
  )
  const snap = await getDocs(q)
  if (snap.empty) return null
  const d = snap.docs[0]
  return { id: d.id, ...(d.data() as Omit<Entry, 'id'>) }
}

// Manual admin edits go to the override doc, keyed by golfer name. They win over
// the cron-written live scores until cleared, and the cron never touches this
// doc — so a correction (e.g. a cut/WD ESPN is slow to reflect) sticks.
export async function saveGolferScore(score: GolferScore): Promise<void> {
  await setDoc(
    doc(db, 'scoreOverrides', score.tournamentId),
    { golfers: { [score.name]: score } },
    { merge: true },
  )
}

// Remove a manual override so the golfer reverts to the live ESPN score.
export async function clearGolferOverride(
  tournamentId: string,
  golferName: string,
): Promise<void> {
  await setDoc(
    doc(db, 'scoreOverrides', tournamentId),
    { golfers: { [golferName]: deleteField() } },
    { merge: true },
  )
}
