import {
  addDoc,
  collection,
  deleteDoc,
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

export function subscribeGolferScores(
  tournamentId: string,
  onChange: (scores: GolferScore[]) => void,
): () => void {
  const q = query(
    collection(db, 'golferScores'),
    where('tournamentId', '==', tournamentId),
  )
  return onSnapshot(
    q,
    (snap) => {
      const scores: GolferScore[] = []
      snap.forEach((d) =>
        scores.push({ id: d.id, ...(d.data() as Omit<GolferScore, 'id'>) }),
      )
      onChange(scores)
    },
    (err) => console.error('subscribeGolferScores:', err),
  )
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
  const q = query(collection(db, 'golferScores'), where('tournamentId', '==', tournamentId))
  const snap = await getDocs(q)
  const items: GolferScore[] = []
  snap.forEach((d) => items.push({ id: d.id, ...(d.data() as Omit<GolferScore, 'id'>) }))
  return items
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

export async function saveGolferScore(score: GolferScore): Promise<void> {
  const { id, ...rest } = score
  await setDoc(doc(db, 'golferScores', id), rest, { merge: true })
}
