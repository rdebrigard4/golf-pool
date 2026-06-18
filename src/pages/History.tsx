import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import {
  listEntries,
  listGolferScores,
  listPastTournaments,
} from '../lib/storage'
import {
  defaultPayout,
  rankEntries,
  winningGolferScore,
} from '../lib/scoring'
import type { GolferScore, RankedEntry, Tournament } from '../types'

const PLACES = ['1st', '2nd', '3rd']

function formatScore(n: number): string {
  if (n === 0) return 'E'
  if (n > 0) return `+${n}`
  return String(n)
}

export default function History() {
  const [tournaments, setTournaments] = useState<Tournament[]>([])
  const [topByT, setTopByT] = useState<Record<string, RankedEntry[]>>({})
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    listPastTournaments()
      .then(setTournaments)
      .catch((err) => console.error('listPastTournaments:', err))
      .finally(() => setLoading(false))
  }, [])

  useEffect(() => {
    if (tournaments.length === 0) return
    ;(async () => {
      const next: Record<string, RankedEntry[]> = {}
      for (const t of tournaments) {
        try {
          const [entries, scores] = await Promise.all([
            listEntries(t.id),
            listGolferScores(t.id),
          ])
          const golfersMap = new Map<string, GolferScore>()
          for (const s of scores) golfersMap.set(s.name, s)
          const paidCount = entries.filter((e) => e.paid).length
          const pot = paidCount * t.entryFee
          const lastPlaceAmount = t.entryFee
          const payouts =
            t.payoutStructure && t.payoutStructure.length > 0
              ? t.payoutStructure
              : defaultPayout(Math.max(0, pot - lastPlaceAmount))
          const winning = winningGolferScore(scores)
          const ranked = rankEntries(
            entries,
            golfersMap,
            winning,
            payouts,
            lastPlaceAmount,
          )
          next[t.id] = ranked.slice(0, 3)
        } catch (err) {
          console.error('history snippet failed:', t.id, err)
          next[t.id] = []
        }
      }
      setTopByT(next)
    })()
  }, [tournaments])

  if (loading) return <p className="muted">Loading…</p>

  if (tournaments.length === 0) {
    return (
      <div className="card">
        <h2>No past tournaments yet</h2>
        <p className="muted">
          Tournaments appear here once they're marked complete in the Admin panel.
        </p>
      </div>
    )
  }

  return (
    <div>
      {tournaments.map((t) => {
        const top = topByT[t.id]
        return (
          <Link key={t.id} to={`/history/${t.id}`} className="card history-link">
            <div className="history-info">
              <div className="history-title">
                {t.name} <span className="history-year">{t.year}</span>
              </div>
              <div className="muted history-date">
                {new Date(t.firstTeeTime).toLocaleDateString(undefined, {
                  month: 'short',
                  day: 'numeric',
                  year: 'numeric',
                })}
              </div>
            </div>
            {top && top.length > 0 && (
              <ul className="history-top">
                {top.map((r, i) => (
                  <li key={r.entry.id}>
                    <span className="history-place">{PLACES[i] ?? `${i + 1}.`}</span>
                    <span className="history-team">{r.entry.entryName}</span>
                    <span className="muted history-score">
                      {formatScore(r.total)}
                    </span>
                    {r.payout > 0 && (
                      <span className="history-payout">${r.payout}</span>
                    )}
                  </li>
                ))}
              </ul>
            )}
            <span className="history-arrow muted">›</span>
          </Link>
        )
      })}
    </div>
  )
}
