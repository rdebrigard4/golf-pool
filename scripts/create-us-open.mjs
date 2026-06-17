import { initializeApp } from 'firebase/app'
import {
  collection,
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
  console.error('Run with: ADMIN_PASSWORD=your-password node scripts/create-us-open.mjs')
  process.exit(1)
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

// Tier 5a and 5b draw from the same pool.
const TIER5 = [
  'Kurt Kitayama', 'Joaquin Niemann', 'Ben Griffin', 'Adam Scott',
  'Maverick McNealy', 'Shane Lowry', 'Harris English', 'Jake Knapp',
  'Bud Cauley', 'David Puig', 'Alex Fitzpatrick', 'Alex Smalley',
  'Aaron Rai', 'Ryan Gerard', 'Kristoffer Reitan', 'Sepp Straka',
  'Rickie Fowler', 'J.T. Poston', 'Gary Woodland', 'Nicolai Hojgaard',
  'Jacob Bridgeman', 'Jason Day', 'Alex Noren', 'Sudarshan Yellamaraju',
  'Keith Mitchell', 'Jackson Koivun', 'Akshay Bhatia', 'Keegan Bradley',
  'Cameron Smith', 'Ryan Fox', 'Dustin Johnson', 'Sahith Theegala',
  'Harry Hall', 'Tom Kim', 'Pierceson Coody', 'Daniel Berger',
  'Corey Conners', 'Brian Harman', 'Sungjae Im', 'Jackson Suber',
  'Davis Thompson', 'Ryo Hisatsune', 'Nick Taylor', 'Lucas Herbert',
  'Jayden Schaper', 'Sam Stevens', 'Max Greyserman', 'Carlos Ortiz',
  'Andrew Novak', 'Michael Kim', 'Matt McCarty', 'Andrew Putnam',
  'Benjamin James', 'Michael Brennan', 'John Keefer', 'William Mouw',
  'Adrien Dumont De Chassart', 'Preston Stout', 'Max McGreevy',
  'Patrick Rodgers', 'Nico Echavarria', 'Chris Kirk', 'Matthias Schmid',
  'Emiliano Grillo', 'John Parry', 'Nathan Kimsey', 'Ben Kohles',
  'Billy Horschel', 'Hennie du Plessis', 'Chandler Phillips', 'Neal Shipley',
  'Cooper Dossey', 'Caleb Surratt', 'Laurie Canter', 'Kevin Roy',
  'Adrien Saddier', 'Ugo Coussaud', 'Jimmy Stanger', 'Matthew Jordan',
  'Zac Blair', 'Cole Hammer', 'Alejandro Tosti', 'Padraig Harrington',
  'Dylan Wu', 'Peter Uihlein', 'Ben Silverman', 'Taylor Montgomery',
  'Niklas Norgaard', 'Carl Yuan', 'Nick Hardy', 'Arni Sveinsson',
  'Ethan Fang', 'Mason Howell', 'Eric Lee', 'James Nicholas',
  'Graeme McDowell', 'Taihei Sato', 'Ryder Cowan', 'Greyson Leach',
  'Harry Higgs', 'Jackson Herrington', 'Mateo Pulcini', 'Chase Kyes',
  'Marcelo Rozo', 'Jake Peacock', 'Jackson Van Paris', 'J.B. Holmes',
  'Filippo Celli', 'Bryan Lee', 'Spencer Tibbits', 'Rocco Repetto',
  'Logan Reilly', 'Manav Shah', 'Kaito Onishi', 'Jake Sollon',
  'Jackson Ormond', 'Jack Schoenberger', 'Brandon Wu', 'Brandon Holtz',
  'Angel Hidalgo', 'Ryuichi Oiwa', 'Robbie Higgins', 'Vaughn Harber',
  'Taek Soo Kim', 'Matt Robles', 'Marek Fleming', 'Hamilton Coleman',
]

const GOLFERS = {
  tier1: ['Scottie Scheffler', 'Rory McIlroy', 'Jon Rahm'],
  tier2: [
    'Xander Schauffele', 'Cameron Young', 'Matt Fitzpatrick',
    'Tommy Fleetwood', 'Ludvig Aberg', 'Bryson DeChambeau',
  ],
  tier3: [
    'Brooks Koepka', 'Collin Morikawa', 'Russell Henley', 'Wyndham Clark',
    'Si Woo Kim', 'Sam Burns', 'Chris Gotterup', 'Justin Thomas',
    'Patrick Cantlay',
  ],
  tier4: [
    'Tyrrell Hatton', 'Patrick Reed', 'Viktor Hovland', 'Justin Rose',
    'J.J. Spaun', 'Robert MacIntyre', 'Hideki Matsuyama', 'Min Woo Lee',
    'Jordan Spieth',
  ],
  tier5a: TIER5,
  tier5b: TIER5,
}

const app = initializeApp(firebaseConfig)
const db = getFirestore(app)
const auth = getAuth(app)

console.log('Signing in as admin…')
await signInWithEmailAndPassword(auth, ADMIN_EMAIL, PASSWORD)

const id = 'us-open-2026'

const tiers = {}
for (const tier of TIER_IDS) {
  tiers[tier] = { label: TIER_LABELS[tier], golfers: GOLFERS[tier] }
}

const tournament = {
  name: 'US Open',
  year: 2026,
  firstTeeTime: new Date('2026-06-18T06:35:00-04:00').toISOString(),
  lockedManually: false,
  isActive: true,
  isComplete: false,
  entryFee: 25,
  payoutStructure: [],
  tiers,
  espnEventId: '401811952',
}

console.log(`Creating tournament "${tournament.name} ${tournament.year}" (${id})…`)
for (const tier of TIER_IDS) {
  console.log(`  ${TIER_LABELS[tier]}: ${tiers[tier].golfers.length} golfers`)
}

// Mirror saveTournament(): setDoc merge on the tournament doc.
await setDoc(doc(db, 'tournaments', id), tournament, { merge: true })

// Mirror activateTournament(): deactivate any other active tournament.
const activeSnap = await getDocs(
  query(collection(db, 'tournaments'), where('isActive', '==', true)),
)
for (const d of activeSnap.docs) {
  if (d.id !== id) {
    await updateDoc(d.ref, { isActive: false })
    console.log(`Deactivated previously active tournament: ${d.id}`)
  }
}
await updateDoc(doc(db, 'tournaments', id), { isActive: true })

console.log('Done. US Open 2026 is created and active.')
process.exit(0)
