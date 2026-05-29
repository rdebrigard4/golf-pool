export type TierId = 'tier1' | 'tier2' | 'tier3' | 'tier4' | 'tier5a' | 'tier5b'

export const TIER_IDS: TierId[] = ['tier1', 'tier2', 'tier3', 'tier4', 'tier5a', 'tier5b']

export const TIER_LABELS: Record<TierId, string> = {
  tier1: 'Tier 1',
  tier2: 'Tier 2',
  tier3: 'Tier 3',
  tier4: 'Tier 4',
  tier5a: 'Tier 5a',
  tier5b: 'Tier 5b',
}

export interface PayoutSlot {
  position: number
  amount: number
}

export interface TierConfig {
  label: string
  golfers: string[]
}

export interface Tournament {
  id: string
  name: string
  year: number
  firstTeeTime: string
  lockedManually: boolean
  isActive: boolean
  isComplete: boolean
  entryFee: number
  payoutStructure: PayoutSlot[]
  tiers: Record<TierId, TierConfig>
  espnEventId?: string
  finalWinningScore?: number
}

export interface Entry {
  id: string
  tournamentId: string
  entryName: string
  email: string
  picks: Record<TierId, string>
  tiebreak: number
  paid: boolean
  submittedAt: string
}

export type GolferStatus = 'active' | 'cut' | 'wd' | 'dq' | 'complete'

export interface GolferScore {
  id: string
  tournamentId: string
  name: string
  tier: TierId
  rounds: {
    r1: number | null
    r2: number | null
    r3: number | null
    r4: number | null
  }
  status: GolferStatus
  wdRound?: 1 | 2 | 3 | 4
  totalToPar?: number
  lastUpdated?: string
}

export interface RankedEntry {
  entry: Entry
  total: number
  rank: number
  payout: number
}
