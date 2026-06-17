import { initializeApp } from 'firebase/app'
import {
  collection,
  doc,
  getDocs,
  getFirestore,
  query,
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
const TOURNAMENT_ID = 'us-open-2026'
const PAID = !process.argv.includes('--unpaid') // pass --unpaid to set them all back to false

if (!PASSWORD) {
  console.error('Run with: ADMIN_PASSWORD=your-password node scripts/mark-all-paid.mjs [--unpaid]')
  process.exit(1)
}

const app = initializeApp(firebaseConfig)
const db = getFirestore(app)
const auth = getAuth(app)

console.log('Signing in as admin…')
await signInWithEmailAndPassword(auth, ADMIN_EMAIL, PASSWORD)

const snap = await getDocs(
  query(collection(db, 'entries'), where('tournamentId', '==', TOURNAMENT_ID)),
)
console.log(`Found ${snap.size} entries. Setting paid=${PAID}…`)

let changed = 0
for (const d of snap.docs) {
  if (d.data().paid !== PAID) {
    await updateDoc(doc(db, 'entries', d.id), { paid: PAID })
    changed++
  }
}

console.log(`Done. ${changed} updated, ${snap.size - changed} already paid=${PAID}.`)
process.exit(0)
