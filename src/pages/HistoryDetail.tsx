import { useEffect, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import Leaderboard from '../components/Leaderboard'
import {
  getTournament,
  subscribeEntries,
  subscribeGolferScores,
} from '../lib/storage'
import type { Entry, GolferScore, Tournament } from '../types'

export default function HistoryDetail() {
  const { tournamentId } = useParams<{ tournamentId: string }>()
  const [tournament, setTournament] = useState<Tournament | null>(null)
  const [entries, setEntries] = useState<Entry[]>([])
  const [scores, setScores] = useState<GolferScore[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (!tournamentId) return
    getTournament(tournamentId)
      .then((t) => setTournament(t))
      .finally(() => setLoading(false))
  }, [tournamentId])

  useEffect(() => {
    if (!tournamentId) return
    return subscribeEntries(tournamentId, setEntries)
  }, [tournamentId])

  useEffect(() => {
    if (!tournamentId) return
    return subscribeGolferScores(tournamentId, setScores)
  }, [tournamentId])

  if (loading) return <p className="muted">Loading…</p>
  if (!tournament) {
    return (
      <div className="card">
        <h2>Tournament not found</h2>
        <Link to="/history" className="btn">
          Back to history
        </Link>
      </div>
    )
  }

  return (
    <div>
      <Link to="/history" className="link-btn back-link">
        ‹ Back to history
      </Link>
      <Leaderboard
        tournament={tournament}
        entries={entries}
        scores={scores}
        badge="FINAL"
      />
    </div>
  )
}
