import { useMemo } from 'react'
import {
  defaultPayout,
  rankEntries,
  scoreGolferForTeam,
  winningGolferScore,
} from '../lib/scoring'
import { TIER_IDS, TIER_LABELS } from '../types'
import type {
  Entry,
  GolferScore,
  PayoutSlot,
  Tournament,
} from '../types'

function formatScore(n: number): string {
  if (n === 0) return 'E'
  if (n > 0) return `+${n}`
  return String(n)
}

interface Props {
  tournament: Tournament
  entries: Entry[]
  scores: GolferScore[]
  badge?: string
}

export default function Leaderboard({
  tournament,
  entries,
  scores,
  badge = 'LIVE',
}: Props) {
  const paidEntries = useMemo(() => entries.filter((e) => e.paid), [entries])

  const golfersMap = useMemo(() => {
    const m = new Map<string, GolferScore>()
    for (const s of scores) m.set(s.name, s)
    return m
  }, [scores])

  const winning = winningGolferScore(scores)

  const pot = paidEntries.length * tournament.entryFee
  const payoutStructure: PayoutSlot[] =
    tournament.payoutStructure && tournament.payoutStructure.length > 0
      ? tournament.payoutStructure
      : defaultPayout(pot)

  const ranked = useMemo(
    () => rankEntries(entries, golfersMap, winning, payoutStructure),
    [entries, golfersMap, winning, payoutStructure],
  )

  return (
    <div>
      <div className="card hero">
        <h2 className="hero-name">
          {tournament.name} <span className="hero-year">{tournament.year}</span>
        </h2>
        <div className="hero-divider" />
        <div className="leaderboard-status">
          <span className={`live-badge ${badge === 'FINAL' ? 'final-badge' : ''}`}>
            {badge}
          </span>
          <span className="muted">
            {paidEntries.length} {paidEntries.length === 1 ? 'team' : 'teams'} · pot $
            {pot}
          </span>
        </div>
        {scores.length > 0 && winning < Infinity && (
          <p className="hero-subtle">Leader at {formatScore(winning)}</p>
        )}
      </div>

      {ranked.length === 0 ? (
        <div className="card">
          <p className="muted">No paid entries.</p>
        </div>
      ) : (
        <div className="card lb-wrap">
          <table className="lb-grid">
            <thead>
              <tr>
                <th className="col-rank">#</th>
                <th className="col-team">Team</th>
                {TIER_IDS.map((t) => (
                  <th key={t} className="col-tier">
                    {tournament.tiers[t]?.label ?? TIER_LABELS[t]}
                  </th>
                ))}
                <th className="col-tb">TB</th>
                <th className="col-total">Total</th>
                <th className="col-payout">Payout</th>
              </tr>
            </thead>
            <tbody>
              {ranked.map((r) => (
                <tr key={r.entry.id}>
                  <td className="col-rank">{r.rank}</td>
                  <td className="col-team">{r.entry.entryName}</td>
                  {TIER_IDS.map((t) => {
                    const golfer = golfersMap.get(r.entry.picks[t])
                    let contribution: number | null = null
                    if (golfer) {
                      contribution = scoreGolferForTeam(
                        golfer,
                        t,
                        paidEntries,
                        golfersMap,
                      )
                    }
                    const flag =
                      golfer?.status === 'cut'
                        ? 'CUT'
                        : golfer?.status === 'wd'
                          ? 'WD'
                          : golfer?.status === 'dq'
                            ? 'DQ'
                            : null
                    return (
                      <td key={t} className="col-tier">
                        <div className="cell-content">
                          <span className="cell-golfer">
                            {r.entry.picks[t]}
                            {flag && <span className="lb-pick-flag">{flag}</span>}
                          </span>
                          <span className="cell-score">
                            {contribution !== null ? formatScore(contribution) : '—'}
                          </span>
                        </div>
                      </td>
                    )
                  })}
                  <td className="col-tb">{r.entry.tiebreak}</td>
                  <td className="col-total">{formatScore(r.total)}</td>
                  <td className="col-payout">
                    {r.payout > 0 ? `$${r.payout}` : '—'}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
