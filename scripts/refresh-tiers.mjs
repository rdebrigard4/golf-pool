import { initializeApp } from 'firebase/app'
import {
  collection,
  deleteDoc,
  doc,
  getDocs,
  getFirestore,
  query,
  setDoc,
  updateDoc,
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
  console.error('Run with: ADMIN_PASSWORD=your-password node scripts/refresh-tiers.mjs')
  process.exit(1)
}

const NEW_TIERS = {
  tier1: ['Scottie Scheffler', 'Rory McIlroy'],
  tier2: [
    'Xander Schauffele',
    'Collin Morikawa',
    'Bryson DeChambeau',
    'Jon Rahm',
  ],
  tier3: [
    'Ludvig Aberg',
    'Viktor Hovland',
    'Patrick Cantlay',
    'Justin Thomas',
    'Hideki Matsuyama',
    'Cameron Smith',
  ],
  tier4: [
    'Tommy Fleetwood',
    'Tony Finau',
    'Sahith Theegala',
    'Jordan Spieth',
    'Brooks Koepka',
    'Cameron Young',
    'Russell Henley',
    'Wyndham Clark',
  ],
  tier5a: [
    'Akshay Bhatia',
    'Min Woo Lee',
    'Sungjae Im',
    'Sepp Straka',
    'Robert MacIntyre',
    'Sam Burns',
    'Tyrrell Hatton',
    'Shane Lowry',
    'Joaquin Niemann',
    'Matthew Fitzpatrick',
  ],
  tier5b: [
    'Nicolai Højgaard',
    'Adam Hadwin',
    'Maverick McNealy',
    'Si Woo Kim',
    'Keegan Bradley',
    'Aaron Rai',
    'Stephan Jaeger',
    'Davis Thompson',
    'Will Zalatoris',
    'Patrick Reed',
  ],
}

const TIER_IDS = ['tier1', 'tier2', 'tier3', 'tier4', 'tier5a', 'tier5b']
const TIER_LABELS = {
  tier1: 'Tier 1',
  tier2: 'Tier 2',
  tier3: 'Tier 3',
  tier4: 'Tier 4',
  tier5a: 'Tier 5a',
  tier5b: 'Tier 5b',
}

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

console.log('Updating tiers (30 golfers, 5 per tier)…')
const newTiers = {}
for (const tier of TIER_IDS) {
  newTiers[tier] = { label: TIER_LABELS[tier], golfers: NEW_TIERS[tier] }
}
await updateDoc(doc(db, 'tournaments', t.id), { tiers: newTiers })
console.log('Tiers updated.')

const gSnap = await getDocs(
  query(collection(db, 'golferScores'), where('tournamentId', '==', t.id)),
)
console.log(`Deleting ${gSnap.size} existing golfer scores…`)
for (const d of gSnap.docs) {
  await deleteDoc(d.ref)
}

const r = () => Math.floor(Math.random() * 9) - 4

let scoresAdded = 0
for (const tier of TIER_IDS) {
  for (const name of NEW_TIERS[tier]) {
    const roll = Math.random()
    let status
    let wdRound
    if (roll < 0.75) status = 'active'
    else if (roll < 0.9) status = 'cut'
    else if (roll < 0.97) {
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

const eSnap = await getDocs(
  query(collection(db, 'entries'), where('tournamentId', '==', t.id)),
)
console.log(`Randomizing picks for ${eSnap.size} entries…`)
let entriesUpdated = 0
for (const eDoc of eSnap.docs) {
  const picks = {}
  for (const tier of TIER_IDS) {
    const list = NEW_TIERS[tier]
    picks[tier] = list[Math.floor(Math.random() * list.length)]
  }
  await updateDoc(eDoc.ref, { picks })
  entriesUpdated++
}
console.log(`Randomized ${entriesUpdated} entries.`)

console.log('Done.')
process.exit(0)
