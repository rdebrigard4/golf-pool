import type { Entry, TierId, Tournament } from '../types'
import { TIER_IDS } from '../types'

// Shinnecock Hills: par 70 x 4 rounds. Used to convert total-stroke
// tiebreaks (e.g. 277) into to-par (e.g. -3).
const PAR_TOTAL = 280

export interface ParsedEntry {
  docId: string
  rowNum: number
  entry: Omit<Entry, 'id' | 'paid'>
}

export interface ImportPreview {
  entries: ParsedEntry[]
  problems: string[]
  rowCount: number
}

// CSV parser that handles quoted fields with embedded commas/quotes/newlines.
export function parseCsv(text: string): string[][] {
  const rows: string[][] = []
  let row: string[] = []
  let field = ''
  let inQuotes = false
  for (let i = 0; i < text.length; i++) {
    const c = text[i]
    if (inQuotes) {
      if (c === '"') {
        if (text[i + 1] === '"') {
          field += '"'
          i++
        } else inQuotes = false
      } else field += c
    } else if (c === '"') inQuotes = true
    else if (c === ',') {
      row.push(field)
      field = ''
    } else if (c === '\n') {
      row.push(field)
      rows.push(row)
      row = []
      field = ''
    } else if (c === '\r') {
      /* skip */
    } else field += c
  }
  if (field.length || row.length) {
    row.push(field)
    rows.push(row)
  }
  return rows
}

export function slug(s: string): string {
  return s
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
}

export function normalizeTiebreak(raw: string): { value: number | null; flag?: string } {
  let s = String(raw).trim()
  if (!s) return { value: null, flag: 'empty' }
  const paren = s.match(/^(-?\+?\d+)\s*\(/) // "-3 (277)" -> "-3"
  if (paren) s = paren[1]
  s = s.replace(/^\+/, '') // "+3" -> "3"
  if (/^e(ven)?$/i.test(s)) return { value: 0 }
  const n = Number(s)
  if (!Number.isFinite(n)) return { value: null, flag: `unparseable: "${raw}"` }
  if (n >= 200) return { value: n - PAR_TOTAL } // total strokes -> to-par
  if (n >= 50) return { value: null, flag: `ambiguous (50-199): "${raw}"` }
  return { value: n } // already to-par
}

// Resolve column indices by header text so a reordered export still works.
function resolveColumns(header: string[]): Record<string, number> | null {
  const find = (pred: (h: string) => boolean) =>
    header.findIndex((h) => pred(h.trim().toLowerCase()))
  const cols: Record<string, number> = {
    ts: find((h) => h.includes('timestamp')),
    email: find((h) => h.includes('email')),
    name: find((h) => h.includes('entry name') || h === 'team' || h.includes('team name')),
    tiebreak: find((h) => h.includes('tiebreak')),
    tier1: find((h) => h.includes('tier 1')),
    tier2: find((h) => h.includes('tier 2')),
    tier3: find((h) => h.includes('tier 3')),
    tier4: find((h) => h.includes('tier 4')),
    tier5a: find((h) => h.includes('tier 5a')),
    tier5b: find((h) => h.includes('tier 5b')),
  }
  if (Object.values(cols).some((i) => i < 0)) return null
  return cols
}

// Parse + validate a Google Form CSV against the tournament's tiers.
// Does NOT touch Firestore — the caller resolves paid flags and writes.
export function buildImport(csvText: string, tournament: Tournament): ImportPreview {
  const problems: string[] = []
  const rows = parseCsv(csvText)
  const header = rows.shift()
  if (!header) return { entries: [], problems: ['Empty file.'], rowCount: 0 }

  const COL = resolveColumns(header)
  if (!COL) {
    return {
      entries: [],
      problems: [
        'Could not find expected columns. Need: Timestamp, Email, Entry Name, Tier 1–5b, Tiebreak.',
      ],
      rowCount: 0,
    }
  }

  const tierGolfers: Record<TierId, Set<string>> = {} as Record<TierId, Set<string>>
  for (const tier of TIER_IDS) {
    tierGolfers[tier] = new Set(tournament.tiers[tier]?.golfers ?? [])
  }

  const dataRows = rows.filter((r) => r.length > 1 && r.some((c) => c.trim()))
  const byId = new Map<string, { parsed: ParsedEntry; tsMillis: number }>()

  dataRows.forEach((r, idx) => {
    const rowNum = idx + 2 // header + 1-based
    const email = (r[COL.email] ?? '').trim().toLowerCase()
    const entryName = (r[COL.name] ?? '').trim()
    if (!email || !entryName) {
      problems.push(`Row ${rowNum}: missing email or entry name — skipped`)
      return
    }

    const picks = {} as Record<TierId, string>
    for (const tier of TIER_IDS) {
      const pick = (r[COL[tier]] ?? '').trim()
      picks[tier] = pick
      if (!tierGolfers[tier].has(pick)) {
        problems.push(`Row ${rowNum} (${entryName}): "${pick}" is not in ${tier}`)
      }
    }
    if (picks.tier5a && picks.tier5a === picks.tier5b) {
      problems.push(
        `Row ${rowNum} (${entryName}): same golfer picked for 5a and 5b (${picks.tier5a})`,
      )
    }

    const tb = normalizeTiebreak(r[COL.tiebreak] ?? '')
    if (tb.flag) problems.push(`Row ${rowNum} (${entryName}): tiebreak ${tb.flag}`)

    const ts = new Date((r[COL.ts] ?? '').trim())
    const tsMillis = ts.getTime()
    const submittedAt = Number.isFinite(tsMillis) ? ts.toISOString() : new Date().toISOString()

    const docId = `${tournament.id}--${email}--${slug(entryName)}`
    const parsed: ParsedEntry = {
      docId,
      rowNum,
      entry: { tournamentId: tournament.id, entryName, email, picks, tiebreak: tb.value ?? 0, submittedAt },
    }

    const prev = byId.get(docId)
    if (!prev || tsMillis > prev.tsMillis) byId.set(docId, { parsed, tsMillis })
  })

  return {
    entries: [...byId.values()].map((v) => v.parsed),
    problems,
    rowCount: dataRows.length,
  }
}
