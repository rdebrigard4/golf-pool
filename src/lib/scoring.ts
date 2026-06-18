import type { Entry, GolferScore, PayoutSlot, RankedEntry, TierId } from '../types'
import { TIER_IDS } from '../types'

type Round = 1 | 2 | 3 | 4

function roundScore(g: GolferScore, r: Round): number | null {
  return g.rounds[`r${r}` as keyof GolferScore['rounds']]
}

function worstTierScoreForRound(
  tier: TierId,
  round: Round,
  paidEntries: Entry[],
  golfers: Map<string, GolferScore>,
): number {
  const tierPicks = new Set(paidEntries.map((e) => e.picks[tier]))
  let worst = -Infinity
  for (const name of tierPicks) {
    const g = golfers.get(name)
    if (!g) continue
    if (g.status === 'wd' || g.status === 'dq') continue
    const score = roundScore(g, round)
    if (score == null) continue
    if (score > worst) worst = score
  }
  return worst === -Infinity ? 0 : worst
}

export function scoreGolferForTeam(
  golfer: GolferScore,
  tier: TierId,
  paidEntries: Entry[],
  golfers: Map<string, GolferScore>,
): number {
  if (golfer.status === 'cut') {
    const r1 = roundScore(golfer, 1) ?? 0
    const r2 = roundScore(golfer, 2) ?? 0
    return 2 * (r1 + r2)
  }

  if (golfer.status === 'wd' || golfer.status === 'dq') {
    const wd = (golfer.wdRound ?? 1) as Round
    let total = 0
    for (let r = 1 as Round; r <= 4; r = (r + 1) as Round) {
      if (r < wd) {
        total += roundScore(golfer, r) ?? 0
      } else {
        total += worstTierScoreForRound(tier, r, paidEntries, golfers)
      }
    }
    return total
  }

  let total = 0
  for (let r = 1 as Round; r <= 4; r = (r + 1) as Round) {
    total += roundScore(golfer, r) ?? 0
  }
  return total
}

export function computeTeamTotal(
  entry: Entry,
  paidEntries: Entry[],
  golfers: Map<string, GolferScore>,
): number {
  let total = 0
  for (const tier of TIER_IDS) {
    const golfer = golfers.get(entry.picks[tier])
    if (!golfer) continue
    total += scoreGolferForTeam(golfer, tier, paidEntries, golfers)
  }
  return total
}

export function rankEntries(
  entries: Entry[],
  golfers: Map<string, GolferScore>,
  winningGolferScore: number,
  payoutStructure: PayoutSlot[],
  lastPlaceAmount = 0,
): RankedEntry[] {
  const paid = entries.filter((e) => e.paid)

  const totals = paid.map((entry) => ({
    entry,
    total: computeTeamTotal(entry, paid, golfers),
  }))

  totals.sort((a, b) => {
    if (a.total !== b.total) return a.total - b.total
    return (
      Math.abs(a.entry.tiebreak - winningGolferScore) -
      Math.abs(b.entry.tiebreak - winningGolferScore)
    )
  })

  const ranked = totals.map((t, idx) => ({
    ...t,
    rank: idx + 1,
    payout: payoutStructure.find((p) => p.position === idx + 1)?.amount ?? 0,
  }))

  // Booby prize: last place gets their buy-in back, but only when there are
  // more teams than paid positions (so it can't clobber a top finisher in a
  // tiny pool).
  if (lastPlaceAmount > 0 && ranked.length > payoutStructure.length) {
    const last = ranked[ranked.length - 1]
    if (last.payout === 0) last.payout = lastPlaceAmount
  }

  return ranked
}

function sumActualRounds(rounds: GolferScore['rounds']): number {
  return (
    (rounds.r1 ?? 0) +
    (rounds.r2 ?? 0) +
    (rounds.r3 ?? 0) +
    (rounds.r4 ?? 0)
  )
}

export function winningGolferScore(golfers: GolferScore[]): number {
  let best = Infinity
  for (const g of golfers) {
    if (g.status === 'cut' || g.status === 'wd' || g.status === 'dq') continue
    const total = g.totalToPar ?? sumActualRounds(g.rounds)
    if (total < best) best = total
  }
  return best === Infinity ? 0 : best
}

export function defaultPayout(potCents: number): PayoutSlot[] {
  return [
    { position: 1, amount: Math.round(potCents * 0.4) },
    { position: 2, amount: Math.round(potCents * 0.25) },
    { position: 3, amount: Math.round(potCents * 0.15) },
    { position: 4, amount: Math.round(potCents * 0.12) },
    { position: 5, amount: Math.round(potCents * 0.08) },
  ]
}
