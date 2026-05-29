import {
  onAuthStateChanged,
  signInWithEmailAndPassword,
  signOut as fbSignOut,
} from 'firebase/auth'
import type { User } from 'firebase/auth'
import { auth } from '../firebase'

export function signIn(email: string, password: string): Promise<User> {
  return signInWithEmailAndPassword(auth, email, password).then((cred) => cred.user)
}

export function signOut(): Promise<void> {
  return fbSignOut(auth)
}

export function subscribeUser(onChange: (user: User | null) => void): () => void {
  return onAuthStateChanged(auth, onChange)
}
