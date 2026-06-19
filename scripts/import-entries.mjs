import { readFileSync } from 'node:fs'
import { initializeApp } from 'firebase/app'
import {
  collection,
  doc,
  getDocs,
  getFirestore,
  query,
  setDoc,
  where,
} from 'firebase/firestore'
import { getAuth, signInWithEmailAndPassword } from 'firebase/auth'

const firebaseConfig = {
  apiKey: 'AIzaSyAdRt-9AZtQlOizOcf0FUuUHsPHuAkIQBw',
  authDomain: 'golf-pool-3d291.firebaseapp.com',
  projectId: 'golf-pool-3d291',
  storageBucket: 'golf-pool-3d291.firebasestorage.app',
  messagingSenderId: '715366557942',
  appId: '1:715366557942:web:20dff682b09fc63a17e4d7',
}

const ADMIN_EMAIL = 'rdebrigard4@gmail.com'
const PASSWORD = process.env.ADMIN_PASSWORD

const args = process.argv.slice(2)
const DRY_RUN = args.includes('--dry-run')
const PRUNE = args.includes('--prune')
const TOURNAMENT_ID = 'us-open-2026'
const PAR_TOTAL = 280 // Shinnecock Hills par 70 x 4 rounds
const csvPath =
  args.find((a) => !a.startsWith('--')) ??
  '/Users/richard.debrigard/Downloads/2026 US Open Pool (Responses) - Form Responses 1.csv'

if (!PASSWORD) {
  console.error('Run with: ADMIN_PASSWORD=your-password node scripts/import-entries.mjs [csv-path] [--dry-run] [--prune]')
  process.exit(1)
}

const TIER_IDS = ['tier1', 'tier2', 'tier3', 'tier4', 'tier5a', 'tier5b']

// --- CSV parsing (handles quoted fields with embedded commas/quotes) ---
function parseCsv(text) {
  const rows = []
  let row = []
  let field = ''
  let inQuotes = false
  for (let i = 0; i < text.length; i++) {
    const c = text[i]
    if (inQuotes) {
      if (c === '"') {
        if (text[i + 1] === '"') { field += '"'; i++ } else inQuotes = false
      } else field += c
    } else if (c === '"') inQuotes = true
    else if (c === ',') { row.push(field); field = '' }
    else if (c === '\n') { row.push(field); rows.push(row); row = []; field = '' }
    else if (c === '\r') { /* skip */ }
    else field += c
  }
  if (field.length || row.length) { row.push(field); rows.push(row) }
  return rows
}

function slug(s) {
  return s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')
}

// Returns { value, flag } where flag is set when the value is ambiguous/odd.
function normalizeTiebreak(raw) {
  let s = String(raw).trim()
  if (!s) return { value: null, flag: 'empty' }
  // "-3 (277)" -> take the to-par part before the paren
  const paren = s.match(/^(-?\+?\d+)\s*\(/)
  if (paren) s = paren[1]
  s = s.replace(/^\+/, '') // "+3" -> "3"
  if (/^(e|even)(\s*par)?$/i.test(s)) return { value: 0 } // "E", "even", "even par"
  // "10 under" / "10 under par" -> -10 ; "5 over" -> 5
  const overUnder = s.match(/^(\d+)\s*(under|over)(\s*par)?$/i)
  if (overUnder) {
    const mag = Number(overUnder[1])
    return { value: /under/i.test(overUnder[2]) ? -mag : mag }
  }
  const n = Number(s)
  if (!Number.isFinite(n)) return { value: null, flag: `unparseable: "${raw}"` }
  if (n >= 200) return { value: n - PAR_TOTAL } // total strokes -> to-par
  if (n >= 50) return { value: null, flag: `ambiguous (50-199): "${raw}"` }
  return { value: n } // already to-par
}

const app = initializeApp(firebaseConfig)
const db = getFirestore(app)
const auth = getAuth(app)

console.log(`Mode: ${DRY_RUN ? 'DRY RUN (no writes)' : 'LIVE'}${PRUNE ? ' + PRUNE' : ''}`)
console.log(`CSV: ${csvPath}`)
console.log('Signing in as admin…')
await signInWithEmailAndPassword(auth, ADMIN_EMAIL, PASSWORD)

// Load tournament tiers for pick validation.
const tSnap = await getDocs(
  query(collection(db, 'tournaments'), where('isActive', '==', true)),
)
if (tSnap.empty || tSnap.docs[0].id !== TOURNAMENT_ID) {
  console.error(`Active tournament is not ${TOURNAMENT_ID}. Aborting.`)
  process.exit(1)
}
const tournament = tSnap.docs[0].data()
const tierGolfers = {}
for (const tier of TIER_IDS) tierGolfers[tier] = new Set(tournament.tiers[tier].golfers)

// Parse CSV.
const rows = parseCsv(readFileSync(csvPath, 'utf8'))
const header = rows.shift()
const dataRows = rows.filter((r) => r.length > 1 && r.some((c) => c.trim()))

const COL = {
  ts: 0, email: 1, name: 2,
  tier1: 3, tier2: 4, tier3: 5, tier4: 6, tier5a: 7, tier5b: 8,
  tiebreak: 9,
}

const byId = new Map() // docId -> { entry, tsMillis, rowNum }
const problems = []

dataRows.forEach((r, idx) => {
  const rowNum = idx + 2 // account for header + 1-based
  const email = r[COL.email].trim().toLowerCase()
  const entryName = r[COL.name].trim()
  if (!email || !entryName) {
    problems.push(`Row ${rowNum}: missing email or entry name — skipped`)
    return
  }

  const picks = {}
  for (const tier of TIER_IDS) {
    const pick = r[COL[tier]].trim()
    picks[tier] = pick
    if (!tierGolfers[tier].has(pick)) {
      problems.push(`Row ${rowNum} (${entryName}): "${pick}" is not in ${tier}`)
    }
  }
  if (picks.tier5a && picks.tier5a === picks.tier5b) {
    problems.push(`Row ${rowNum} (${entryName}): same golfer picked for 5a and 5b (${picks.tier5a})`)
  }

  const tb = normalizeTiebreak(r[COL.tiebreak])
  if (tb.flag) problems.push(`Row ${rowNum} (${entryName}): tiebreak ${tb.flag}`)

  const ts = new Date(r[COL.ts].trim())
  const tsMillis = ts.getTime()
  const submittedAt = Number.isFinite(tsMillis) ? ts.toISOString() : new Date().toISOString()

  const docId = `${TOURNAMENT_ID}--${email}--${slug(entryName)}`
  const entry = {
    tournamentId: TOURNAMENT_ID,
    entryName,
    email,
    picks,
    tiebreak: tb.value ?? 0,
    submittedAt,
  }

  // Latest-timestamp-wins for same email+team (a genuine edit).
  const prev = byId.get(docId)
  if (!prev || tsMillis > prev.tsMillis) byId.set(docId, { entry, tsMillis, rowNum })
})

// Load existing entries to preserve paid flags and detect removals.
const eSnap = await getDocs(
  query(collection(db, 'entries'), where('tournamentId', '==', TOURNAMENT_ID)),
)
const existing = new Map()
eSnap.forEach((d) => existing.set(d.id, d.data()))

let created = 0
let updated = 0
const csvIds = new Set(byId.keys())

console.log(`\nParsed ${byId.size} unique entries from ${dataRows.length} rows.`)
if (problems.length) {
  console.log(`\n⚠️  ${problems.length} issue(s):`)
  for (const p of problems) console.log(`   - ${p}`)
} else {
  console.log('✓ All picks validate against tiers; all tiebreaks parsed cleanly.')
}

console.log('')
for (const [docId, { entry }] of byId) {
  const prior = existing.get(docId)
  entry.paid = prior?.paid ?? false // preserve commissioner's paid toggle
  if (prior) updated++; else created++
  if (!DRY_RUN) await setDoc(doc(db, 'entries', docId), entry, { merge: true })
}

// Entries in Firestore but no longer in the CSV.
const removed = [...existing.keys()].filter((id) => !csvIds.has(id))
if (removed.length) {
  console.log(`\nℹ️  ${removed.length} existing entr(ies) no longer in CSV:`)
  for (const id of removed) console.log(`   - ${id} (${existing.get(id).entryName})`)
  if (PRUNE && !DRY_RUN) {
    const { deleteDoc } = await import('firebase/firestore')
    for (const id of removed) await deleteDoc(doc(db, 'entries', id))
    console.log(`   → pruned ${removed.length}.`)
  } else {
    console.log('   (not deleted — pass --prune to remove them)')
  }
}

console.log(`\n${DRY_RUN ? '[dry run] would create' : 'Created'} ${created}, ${DRY_RUN ? 'would update' : 'updated'} ${updated}.`)
console.log(DRY_RUN ? 'Dry run complete — no writes made.' : 'Done.')
process.exit(0)
