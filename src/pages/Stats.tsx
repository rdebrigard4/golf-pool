import { useEffect, useMemo, useState } from 'react'
import {
  subscribeActiveTournament,
  subscribeEntries,
} from '../lib/storage'
import { isLocked } from '../lib/dates'
import { TIER_IDS, TIER_LABELS } from '../types'
import type { Entry, TierId, Tournament } from '../types'

export default function Stats() {
  const [tournament, setTournament] = useState<Tournament | null>(null)
  const [entries, setEntries] = useState<Entry[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    return subscribeActiveTournament((t) => {
      setTournament(t)
      setLoading(false)
    })
  }, [])

  useEffect(() => {
    if (!tournament) return
    return subscribeEntries(tournament.id, setEntries)
  }, [tournament?.id])

  if (loading) return <p className="muted">Loading…</p>

  if (!tournament) {
    return (
      <div className="card">
        <h2>No active pool</h2>
        <p className="muted">Stats will appear once a tournament is active.</p>
      </div>
    )
  }

  if (!isLocked(tournament)) {
    return (
      <div className="card">
        <h2>Stats unlock at first tee time</h2>
        <p className="muted">
          Hiding stats until entries close keeps people from strategizing off
          other teams' picks.
        </p>
      </div>
    )
  }

  return <StatsView tournament={tournament} entries={entries} />
}

interface PickCount {
  name: string
  count: number
  pct: number
}

interface TiebreakBucket {
  label: string
  min: number
  max: number
  count: number
}

function StatsView({
  tournament,
  entries,
}: {
  tournament: Tournament
  entries: Entry[]
}) {
  const paid = useMemo(() => entries.filter((e) => e.paid), [entries])
  const pot = paid.length * tournament.entryFee

  const tierStats: { tier: TierId; items: PickCount[] }[] = useMemo(() => {
    return TIER_IDS.map((tier) => {
      const counts = new Map<string, number>()
      for (const e of paid) {
        const pick = e.picks[tier]
        if (!pick) continue
        counts.set(pick, (counts.get(pick) ?? 0) + 1)
      }
      const items = Array.from(counts.entries())
        .map(([name, count]) => ({
          name,
          count,
          pct: paid.length > 0 ? count / paid.length : 0,
        }))
        .sort((a, b) => b.count - a.count)
      return { tier, items }
    })
  }, [paid])

  const tiebreakBuckets: TiebreakBucket[] = useMemo(() => {
    const buckets: TiebreakBucket[] = [
      { label: '-20 or lower', min: -9999, max: -20, count: 0 },
      { label: '-19 to -15', min: -19, max: -15, count: 0 },
      { label: '-14 to -10', min: -14, max: -10, count: 0 },
      { label: '-9 to -5', min: -9, max: -5, count: 0 },
      { label: '-4 or higher', min: -4, max: 9999, count: 0 },
    ]
    for (const e of paid) {
      for (const b of buckets) {
        if (e.tiebreak >= b.min && e.tiebreak <= b.max) {
          b.count++
          break
        }
      }
    }
    return buckets
  }, [paid])

  const maxTbCount = Math.max(...tiebreakBuckets.map((b) => b.count), 1)

  return (
    <div>
      <div className="card hero">
        <h2 className="hero-name">
          {tournament.name} <span className="hero-year">{tournament.year}</span>
        </h2>
        <div className="hero-divider" />
        <div className="stats-counts">
          <div className="stat">
            <div className="stat-num">{entries.length}</div>
            <div className="stat-label">total entries</div>
          </div>
          <div className="stat">
            <div className="stat-num">{paid.length}</div>
            <div className="stat-label">paid</div>
          </div>
          <div className="stat">
            <div className="stat-num">${pot}</div>
            <div className="stat-label">pot</div>
          </div>
        </div>
      </div>

      {paid.length === 0 ? (
        <div className="card">
          <p className="muted">No paid entries yet — nothing to summarize.</p>
        </div>
      ) : (
        <>
          {tierStats.map(({ tier, items }) => (
            <div key={tier} className="card">
              <div className="card-section-head">
                <h3>{tournament.tiers[tier]?.label ?? TIER_LABELS[tier]}</h3>
                <span className="muted">most picked</span>
              </div>
              {items.length === 0 ? (
                <p className="muted">No picks in this tier.</p>
              ) : (
                <div className="stats-bars">
                  {items.map(({ name, count, pct }) => (
                    <div key={name} className="stats-bar">
                      <div className="stats-bar-label">
                        <span className="stats-bar-name">{name}</span>
                        <span className="muted">
                          {count} ({Math.round(pct * 100)}%)
                        </span>
                      </div>
                      <div className="stats-bar-track">
                        <div
                          className="stats-bar-fill"
                          style={{ width: `${Math.max(pct * 100, 2)}%` }}
                        />
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          ))}

          <div className="card">
            <div className="card-section-head">
              <h3>Tiebreak distribution</h3>
              <span className="muted">predicted winning score</span>
            </div>
            <div className="stats-bars">
              {tiebreakBuckets.map((b) => {
                const pct = b.count / maxTbCount
                return (
                  <div key={b.label} className="stats-bar">
                    <div className="stats-bar-label">
                      <span className="stats-bar-name">{b.label}</span>
                      <span className="muted">{b.count}</span>
                    </div>
                    <div className="stats-bar-track">
                      <div
                        className="stats-bar-fill"
                        style={{
                          width: b.count === 0 ? '0%' : `${Math.max(pct * 100, 4)}%`,
                        }}
                      />
                    </div>
                  </div>
                )
              })}
            </div>
          </div>
        </>
      )}
    </div>
  )
}
