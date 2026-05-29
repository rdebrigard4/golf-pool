import { initializeApp } from 'firebase/app'
import {
  addDoc,
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

if (!PASSWORD) {
  console.error('Set ADMIN_PASSWORD env var:')
  console.error('  ADMIN_PASSWORD=your-password node scripts/seed-dummy.mjs')
  process.exit(1)
}

const TIER_IDS = ['tier1', 'tier2', 'tier3', 'tier4', 'tier5a', 'tier5b']

const TEAM_NAMES = [
  'Birdie Brigade',
  'Bogey Boys',
  'Eagle Eye',
  'The Mulligans',
  'Fairway Frogs',
  'Green Giants',
  'Slice & Dice',
  "Par-tyin' Hard",
  'Tee Time Titans',
  'The Augustans',
  'Hole in None',
  'Iron Eagles',
  'Sand Traps',
  'Bunker Mentality',
  'Pin Seekers',
  'Caddie Crew',
  'Wedge Warriors',
  'Birdie Bandits',
  'Long Drive Legends',
  'The Yips',
]

const N_DUMMY = 20

const app = initializeApp(firebaseConfig)
const db = getFirestore(app)
const auth = getAuth(app)

console.log('Signing in as admin…')
await signInWithEmailAndPassword(auth, ADMIN_EMAIL, PASSWORD)

console.log('Reading active tournament…')
const tSnap = await getDocs(
  query(collection(db, 'tournaments'), where('isActive', '==', true)),
)
if (tSnap.empty) {
  console.error('No active tournament. Create one in /admin first.')
  process.exit(1)
}
const t = { id: tSnap.docs[0].id, ...tSnap.docs[0].data() }
console.log(`Tournament: ${t.name} ${t.year}`)

for (const tier of TIER_IDS) {
  if (!t.tiers?.[tier] || t.tiers[tier].golfers.length === 0) {
    console.error(`No golfers in ${tier}. Fill in tiers in /admin Setup tab.`)
    process.exit(1)
  }
}

const eSnap = await getDocs(
  query(collection(db, 'entries'), where('tournamentId', '==', t.id)),
)
const existingEmails = new Set()
eSnap.forEach((d) => existingEmails.add(d.data().email))
console.log(`Existing entries: ${eSnap.size}`)

console.log(`Adding ${N_DUMMY} dummy entries…`)
let added = 0
for (let i = 0; i < N_DUMMY; i++) {
  const teamName = TEAM_NAMES[i % TEAM_NAMES.length]
  let email = `dummy${i + 1}@example.com`
  let n = 1
  while (existingEmails.has(email)) {
    email = `dummy${i + 1}-${n++}@example.com`
  }
  existingEmails.add(email)

  const picks = {}
  for (const tier of TIER_IDS) {
    const list = t.tiers[tier].golfers
    picks[tier] = list[Math.floor(Math.random() * list.length)]
  }
  const tiebreak = -(8 + Math.floor(Math.random() * 12))
  const paid = Math.random() < 0.75

  await addDoc(collection(db, 'entries'), {
    tournamentId: t.id,
    entryName: teamName,
    email,
    picks,
    tiebreak,
    paid,
    submittedAt: new Date().toISOString(),
  })
  added++
}
console.log(`Added ${added} entries.`)

const gSnap = await getDocs(
  query(collection(db, 'golferScores'), where('tournamentId', '==', t.id)),
)
const scored = new Set()
gSnap.forEach((d) => scored.add(d.data().name))
console.log(`Existing golfer scores: ${gSnap.size}`)

const r = () => Math.floor(Math.random() * 9) - 4

let scoresAdded = 0
for (const tier of TIER_IDS) {
  for (const name of t.tiers[tier].golfers) {
    if (scored.has(name)) continue

    const roll = Math.random()
    let status, wdRound
    if (roll < 0.8) status = 'active'
    else if (roll < 0.92) status = 'cut'
    else if (roll < 0.98) {
      status = 'wd'
      wdRound = 2 + Math.floor(Math.random() * 3)
    } else {
      status = 'dq'
      wdRound = 2 + Math.floor(Math.random() * 3)
    }

    let rounds
    if (status === 'cut') {
      rounds = { r1: r(), r2: r(), r3: null, r4: null }
    } else if (status === 'wd' || status === 'dq') {
      rounds = { r1: null, r2: null, r3: null, r4: null }
      for (let rn = 1; rn < wdRound; rn++) rounds[`r${rn}`] = r()
    } else {
      rounds = { r1: r(), r2: r(), r3: r(), r4: r() }
    }

    const score = {
      tournamentId: t.id,
      name,
      tier,
      rounds,
      status,
      lastUpdated: new Date().toISOString(),
    }
    if (wdRound) score.wdRound = wdRound

    const id = `${t.id}--${name.toLowerCase().replace(/[^a-z0-9]+/g, '-')}`
    await setDoc(doc(db, 'golferScores', id), score)
    scoresAdded++
  }
}
console.log(`Added scores for ${scoresAdded} golfers.`)

console.log('Done.')
process.exit(0)
