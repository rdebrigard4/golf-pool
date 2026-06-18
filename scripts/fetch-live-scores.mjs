// Live-scores fetcher (single source of truth).
//
// ARCHITECTURE: one fetcher -> ONE aggregate `liveScores/{tournamentId}` doc ->
// all clients read that single doc via onSnapshot. ESPN sees exactly one caller,
// and each client pays 1 document read per change instead of 1-per-golfer. This
// is the deliberate design for ~100+ users on the Firebase free tier.
//
// Manual admin edits live in a SEPARATE `scoreOverrides/{tournamentId}` doc and
// take precedence on the client. This fetcher never touches that doc, so manual
// corrections (e.g. a cut/WD that ESPN is slow to reflect) are never clobbered.
//
// Run locally:  ADMIN_PASSWORD=... node scripts/fetch-live-scores.mjs [--dry-run]
// In CI: invoked every ~5 min by .github/workflows/live-scores.yml

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
const DRY_RUN = process.argv.includes('--dry-run')

const TIER_IDS = ['tier1', 'tier2', 'tier3', 'tier4', 'tier5a', 'tier5b']

// ESPN spells some names differently than our tier lists. Key = our canonical
// tier name, value = ESPN `athlete.fullName`. Accents are handled by normalize()
// below; these are the genuine nickname / extra-surname differences.
const NAME_ALIASES = {
  'Nicolai Hojgaard': 'Nicolai Højgaard',
  'Niklas Norgaard': 'Niklas Nørgaard',
  'Benjamin James': 'Ben James',
  'John Keefer': 'Johnny Keefer',
  'Matthias Schmid': 'Matti Schmid',
  'Rocco Repetto': 'Rocco Repetto Taylor',
  'Taek Soo Kim': 'T.K. Kim',
  'Matt Robles': 'Matthew Robles',
}

function normalize(s) {
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

function slug(name) {
  return name.toLowerCase().replace(/[^a-z0-9]+/g, '-')
}

// "-3" -> -3, "E" -> 0, "+2" -> 2, "" / null / "CUT" -> null
function parseToPar(v) {
  if (v == null) return null
  const s = String(v).trim()
  if (s === '' || s === '-') return null
  if (/^e$/i.test(s)) return 0
  const n = Number(s.replace('+', ''))
  return Number.isFinite(n) ? n : null
}

// Map an ESPN competitor status to our GolferStatus. ESPN leaves the status
// object empty during normal play and populates type.name (STATUS_CUT,
// STATUS_WITHDRAWN, STATUS_DISQUALIFIED) once a player is out. We also sniff the
// score string for textual markers as a backstop.
function mapStatus(competitor, eventState) {
  const name = competitor?.status?.type?.name || ''
  const scoreStr = String(competitor?.score ?? '').toUpperCase()
  if (name === 'STATUS_DISQUALIFIED' || scoreStr === 'DQ' || scoreStr === 'DSQ') return 'dq'
  if (name === 'STATUS_WITHDRAWN' || scoreStr === 'WD') return 'wd'
  if (name === 'STATUS_CUT' || scoreStr === 'CUT' || scoreStr === 'MC') return 'cut'
  return null // caller decides active vs complete
}

async function main() {
  if (!PASSWORD && !DRY_RUN) {
    console.error('Run with: ADMIN_PASSWORD=... node scripts/fetch-live-scores.mjs')
    process.exit(1)
  }

  const app = initializeApp(firebaseConfig)
  const db = getFirestore(app)

  if (PASSWORD) {
    const auth = getAuth(app)
    await signInWithEmailAndPassword(auth, ADMIN_EMAIL, PASSWORD)
  }

  // Update every active tournament that has an ESPN event id and isn't finished.
  const tSnap = await getDocs(
    query(collection(db, 'tournaments'), where('isActive', '==', true)),
  )
  if (tSnap.empty) {
    console.log('No active tournament. Nothing to do.')
    return
  }

  for (const tDoc of tSnap.docs) {
    const t = { id: tDoc.id, ...tDoc.data() }
    if (t.isComplete) {
      console.log(`[${t.id}] complete — skipping.`)
      continue
    }
    if (!t.espnEventId) {
      console.log(`[${t.id}] no espnEventId — skipping.`)
      continue
    }
    await fetchTournament(db, t)
  }
}

async function fetchTournament(db, t) {
  const url = `https://site.api.espn.com/apis/site/v2/sports/golf/pga/scoreboard/${t.espnEventId}`
  const res = await fetch(url)
  if (!res.ok) throw new Error(`ESPN ${res.status} for event ${t.espnEventId}`)
  const data = await res.json()

  const comp = data?.competitions?.[0]
  if (!comp) {
    console.error(`[${t.id}] ESPN payload had no competition.`)
    return
  }
  const eventState = comp?.status?.type?.state || data?.status?.type?.state || 'pre'
  const eventComplete = !!comp?.status?.type?.completed
  const currentRound = comp?.status?.period ?? 0

  // Index ESPN competitors by normalized full name.
  const byNorm = new Map()
  for (const c of comp.competitors || []) {
    const full = c?.athlete?.fullName
    if (full) byNorm.set(normalize(full), c)
  }

  // Canonical golfer -> first tier it appears in. (tier5a/5b share a pool; the
  // tier field is cosmetic — scoring uses the entry's pick tier, not this.)
  const tierOf = new Map()
  for (const tier of TIER_IDS) {
    for (const name of t.tiers?.[tier]?.golfers || []) {
      if (!tierOf.has(name)) tierOf.set(name, tier)
    }
  }

  const golfers = []
  const unmatched = []
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

    const rounds = { r1: null, r2: null, r3: null, r4: null }
    for (const ls of c.linescores || []) {
      const p = ls.period
      if (p >= 1 && p <= 4) rounds[`r${p}`] = parseToPar(ls.displayValue)
    }

    let status = mapStatus(c, eventState)
    if (!status) {
      // No out-marker. Complete when the event is final and they have 4 rounds.
      const played = [rounds.r1, rounds.r2, rounds.r3, rounds.r4].filter((x) => x != null).length
      status = eventComplete && played >= 4 ? 'complete' : 'active'
    }

    const g = {
      id: `${t.id}--${slug(name)}`,
      tournamentId: t.id,
      name,
      tier,
      rounds,
      status,
      totalToPar: parseToPar(c.score),
      lastUpdated: now,
    }
    // For a cut player, ESPN may keep R3/R4 null already; for WD/DQ infer the
    // round they stopped so the scoring engine's inheritance rule fires. (Manual
    // override remains the authority if this guess is wrong.)
    if (status === 'wd' || status === 'dq') {
      const played = [1, 2, 3, 4].filter((r) => rounds[`r${r}`] != null)
      g.wdRound = Math.min(4, (played.length ? Math.max(...played) : 0) + 1)
    }
    golfers.push(g)
  }

  const payload = {
    tournamentId: t.id,
    source: 'espn',
    espnEventId: t.espnEventId,
    eventState,
    eventComplete,
    currentRound,
    golfers,
    unmatched, // surfaced for alias maintenance
    updatedAt: now,
  }

  console.log(
    `[${t.id}] ${t.name}: round ${currentRound} (${eventState}), ` +
      `${golfers.length} golfers, ${unmatched.length} unmatched`,
  )
  if (unmatched.length) console.log('  unmatched (add aliases):', unmatched.join(', '))

  if (DRY_RUN) {
    console.log('  --dry-run: not writing.')
    return
  }
  await setDoc(doc(db, 'liveScores', t.id), payload)
  console.log(`  wrote liveScores/${t.id}`)
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error(err)
    process.exit(1)
  })
