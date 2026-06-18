import { doc, setDoc } from 'firebase/firestore'
import { db } from '../firebase'
import { TIER_IDS } from '../types'
import type { GolferScore, GolferStatus, TierId, Tournament } from '../types'

// Browser port of scripts/fetch-live-scores.mjs, used by the Admin "Pull now"
// button so the commissioner can force an immediate refresh instead of waiting
// for the ~5-min cron. The cron remains the primary fetcher; this writes the
// same `liveScores/{tournamentId}` doc (admin is authed, so the rule passes).
//
// KEEP IN SYNC with scripts/fetch-live-scores.mjs — especially NAME_ALIASES and
// the parsing/status logic. (The two are intentionally separate so refactoring
// here can never break the live cron during a tournament.)

// ESPN spells some names differently than our tier lists. Accents are handled
// by normalize(); these are genuine nickname / extra-surname differences.
const NAME_ALIASES: Record<string, string> = {
  'Nicolai Hojgaard': 'Nicolai Højgaard',
  'Niklas Norgaard': 'Niklas Nørgaard',
  'Benjamin James': 'Ben James',
  'John Keefer': 'Johnny Keefer',
  'Matthias Schmid': 'Matti Schmid',
  'Rocco Repetto': 'Rocco Repetto Taylor',
  'Taek Soo Kim': 'T.K. Kim',
  'Matt Robles': 'Matthew Robles',
}

function normalize(s: string): string {
  return (s || '')
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '') // strip combining diacritics
    .replace(/ø/gi, 'o')
    .replace(/æ/gi, 'ae')
    .replace(/ł/gi, 'l')
    .replace(/ß/gi, 'ss')
    .toLowerCase()
    .replace(/[^a-z0-9]/g, '')
}

function slug(name: string): string {
  return name.toLowerCase().replace(/[^a-z0-9]+/g, '-')
}

// "-3" -> -3, "E" -> 0, "+2" -> 2, "" / null / "CUT" -> null
function parseToPar(v: unknown): number | null {
  if (v == null) return null
  const s = String(v).trim()
  if (s === '' || s === '-') return null
  if (/^e$/i.test(s)) return 0
  const n = Number(s.replace('+', ''))
  return Number.isFinite(n) ? n : null
}

// ESPN leaves status empty during normal play and fills type.name once a player
// is out; we also sniff the score string as a backstop.
function mapStatus(competitor: any): GolferStatus | null {
  const name = competitor?.status?.type?.name || ''
  const scoreStr = String(competitor?.score ?? '').toUpperCase()
  if (name === 'STATUS_DISQUALIFIED' || scoreStr === 'DQ' || scoreStr === 'DSQ') return 'dq'
  if (name === 'STATUS_WITHDRAWN' || scoreStr === 'WD') return 'wd'
  if (name === 'STATUS_CUT' || scoreStr === 'CUT' || scoreStr === 'MC') return 'cut'
  return null
}

export interface PullResult {
  count: number
  unmatched: string[]
  currentRound: number
  eventState: string
}

export async function pullLiveScores(t: Tournament): Promise<PullResult> {
  if (!t.espnEventId) {
    throw new Error('No ESPN event id is set for this tournament (Settings tab).')
  }
  const url = `https://site.api.espn.com/apis/site/v2/sports/golf/pga/scoreboard/${t.espnEventId}`
  const res = await fetch(url)
  if (!res.ok) throw new Error(`ESPN responded ${res.status} for event ${t.espnEventId}`)
  const data = await res.json()

  const comp = data?.competitions?.[0]
  if (!comp) throw new Error('ESPN payload had no competition data.')
  const eventState: string = comp?.status?.type?.state || data?.status?.type?.state || 'pre'
  const eventComplete = !!comp?.status?.type?.completed
  const currentRound: number = comp?.status?.period ?? 0

  // Index ESPN competitors by normalized full name.
  const byNorm = new Map<string, any>()
  for (const c of comp.competitors || []) {
    const full = c?.athlete?.fullName
    if (full) byNorm.set(normalize(full), c)
  }

  // Canonical golfer -> first tier it appears in (tier5a/5b share a pool; tier
  // is cosmetic, scoring uses the entry's pick tier).
  const tierOf = new Map<string, TierId>()
  for (const tier of TIER_IDS) {
    for (const name of t.tiers?.[tier]?.golfers || []) {
      if (!tierOf.has(name)) tierOf.set(name, tier)
    }
  }

  const golfers: GolferScore[] = []
  const unmatched: string[] = []
  const now = new Date().toISOString()

  for (const [name, tier] of tierOf) {
    const espnName = NAME_ALIASES[name] || name
    const c = byNorm.get(normalize(espnName))

    if (!c) {
      unmatched.push(name)
      golfers.push({
        id: `${t.id}--${slug(name)}`,
        tournamentId: t.id,
        name,
        tier,
        rounds: { r1: null, r2: null, r3: null, r4: null },
        status: 'active',
        lastUpdated: now,
      })
      continue
    }

    const rounds: GolferScore['rounds'] = { r1: null, r2: null, r3: null, r4: null }
    for (const ls of c.linescores || []) {
      const p = ls.period
      if (p >= 1 && p <= 4) {
        rounds[`r${p}` as keyof GolferScore['rounds']] = parseToPar(ls.displayValue)
      }
    }

    let status = mapStatus(c)
    if (!status) {
      const played = [rounds.r1, rounds.r2, rounds.r3, rounds.r4].filter((x) => x != null).length
      status = eventComplete && played >= 4 ? 'complete' : 'active'
    }

    const g: GolferScore = {
      id: `${t.id}--${slug(name)}`,
      tournamentId: t.id,
      name,
      tier,
      rounds,
      status,
      totalToPar: parseToPar(c.score) ?? undefined,
      lastUpdated: now,
    }
    if (status === 'wd' || status === 'dq') {
      const played = [1, 2, 3, 4].filter(
        (r) => rounds[`r${r}` as keyof GolferScore['rounds']] != null,
      )
      g.wdRound = Math.min(4, (played.length ? Math.max(...played) : 0) + 1) as 1 | 2 | 3 | 4
    }
    golfers.push(g)
  }

  await setDoc(doc(db, 'liveScores', t.id), {
    tournamentId: t.id,
    source: 'espn',
    espnEventId: t.espnEventId,
    eventState,
    eventComplete,
    currentRound,
    golfers,
    unmatched,
    updatedAt: now,
  })

  return { count: golfers.length, unmatched, currentRound, eventState }
}
