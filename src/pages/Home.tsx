import { useEffect, useMemo, useState } from 'react'
import type { FormEvent } from 'react'
import {
  createEntry,
  findEntryByEmail,
  subscribeActiveTournament,
  subscribeEntries,
  subscribeGolferScores,
  updateEntry,
} from '../lib/storage'
import {
  forgetMyEntryId,
  loadMyEntryIds,
  saveMyEntryId,
} from '../lib/localEntries'
import { formatCountdown, isLocked } from '../lib/dates'
import Leaderboard from '../components/Leaderboard'
import { TIER_IDS, TIER_LABELS } from '../types'
import type { Entry, GolferScore, TierId, Tournament } from '../types'

export default function Home() {
  const [tournament, setTournament] = useState<Tournament | null>(null)
  const [entries, setEntries] = useState<Entry[]>([])
  const [scores, setScores] = useState<GolferScore[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    return subscribeActiveTournament((t) => {
      setTournament(t)
      setLoading(false)
    })
  }, [])

  useEffect(() => {
    if (!tournament) return
    return subscribeEntries(tournament.id, setEntries)
  }, [tournament?.id])

  useEffect(() => {
    if (!tournament) return
    return subscribeGolferScores(tournament.id, setScores)
  }, [tournament?.id])

  if (loading) return <p className="muted">Loading…</p>

  if (!tournament) {
    return (
      <div className="card">
        <h2>No active pool</h2>
        <p className="muted">Check back later or contact your commissioner.</p>
      </div>
    )
  }

  if (isLocked(tournament)) {
    return (
      <Leaderboard
        tournament={tournament}
        entries={entries}
        scores={scores}
        badge="LIVE"
      />
    )
  }

  return <PreLockView tournament={tournament} entries={entries} />
}

function PreLockView({
  tournament,
  entries,
}: {
  tournament: Tournament
  entries: Entry[]
}) {
  const [now, setNow] = useState(new Date())
  const [myIds, setMyIds] = useState<string[]>(() => loadMyEntryIds(tournament.id))
  const [editTarget, setEditTarget] = useState<Entry | null>(null)

  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), 1000)
    return () => clearInterval(id)
  }, [])

  useEffect(() => {
    setMyIds(loadMyEntryIds(tournament.id))
  }, [tournament.id])

  const myEntries = useMemo(
    () => entries.filter((e) => myIds.includes(e.id)),
    [entries, myIds],
  )

  const teeTime = new Date(tournament.firstTeeTime)
  const countdown = formatCountdown(teeTime, now)

  function handleRemembered(entry: Entry) {
    saveMyEntryId(tournament.id, entry.id)
    setMyIds(loadMyEntryIds(tournament.id))
  }

  function handleForget(entry: Entry) {
    forgetMyEntryId(tournament.id, entry.id)
    setMyIds(loadMyEntryIds(tournament.id))
  }

  return (
    <div>
      <div className="card hero">
        <h2 className="hero-name">
          {tournament.name} <span className="hero-year">{tournament.year}</span>
        </h2>
        <div className="hero-divider" />
        <div className="countdown">{countdown}</div>
        <p className="hero-subtle">
          until first tee · {teeTime.toLocaleString(undefined, {
            weekday: 'short',
            month: 'short',
            day: 'numeric',
            hour: 'numeric',
            minute: '2-digit',
          })}
        </p>
        <p className="team-count">
          <strong>{entries.length}</strong>{' '}
          {entries.length === 1 ? 'team' : 'teams'} submitted
        </p>
      </div>

      {myEntries.length > 0 && (
        <div className="card">
          <h3>Your teams on this device</h3>
          <ul className="my-entries">
            {myEntries.map((e) => (
              <li key={e.id}>
                <div>
                  <strong>{e.entryName}</strong>
                  <span className="muted"> · {e.email}</span>
                </div>
                <div className="my-entry-actions">
                  <button className="link-btn" onClick={() => setEditTarget(e)}>
                    Edit
                  </button>
                  <button
                    className="link-btn muted-link"
                    onClick={() => handleForget(e)}
                    title="Remove from this device only (entry is not deleted)"
                  >
                    Forget
                  </button>
                </div>
              </li>
            ))}
          </ul>
        </div>
      )}

      <EntryForm
        tournament={tournament}
        editTarget={editTarget}
        onClearEdit={() => setEditTarget(null)}
        onCreated={handleRemembered}
      />
    </div>
  )
}

const blankPicks: Record<TierId, string> = {
  tier1: '',
  tier2: '',
  tier3: '',
  tier4: '',
  tier5a: '',
  tier5b: '',
}

function EntryForm({
  tournament,
  editTarget,
  onClearEdit,
  onCreated,
}: {
  tournament: Tournament
  editTarget: Entry | null
  onClearEdit: () => void
  onCreated: (entry: Entry) => void
}) {
  const [entryName, setEntryName] = useState('')
  const [email, setEmail] = useState('')
  const [picks, setPicks] = useState<Record<TierId, string>>(blankPicks)
  const [tiebreak, setTiebreak] = useState('')
  const [editingId, setEditingId] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [confirmed, setConfirmed] = useState<Entry | null>(null)
  const [error, setError] = useState('')
  const [lookupEmail, setLookupEmail] = useState('')
  const [lookupStatus, setLookupStatus] = useState('')
  const [mode, setMode] = useState<'choose' | 'new' | 'lookup' | 'edit'>('choose')

  useEffect(() => {
    if (editTarget) {
      loadFromEntry(editTarget)
      setConfirmed(null)
      setMode('edit')
    }
  }, [editTarget?.id])

  function loadFromEntry(entry: Entry) {
    setEntryName(entry.entryName)
    setEmail(entry.email)
    setPicks(entry.picks)
    setTiebreak(String(entry.tiebreak))
    setEditingId(entry.id)
    setLookupStatus('')
    setError('')
  }

  function startFresh() {
    setEntryName('')
    setEmail('')
    setPicks(blankPicks)
    setTiebreak('')
    setEditingId(null)
    setConfirmed(null)
    setError('')
    setMode('choose')
    setLookupEmail('')
    setLookupStatus('')
    onClearEdit()
  }

  async function handleLookup(e: FormEvent) {
    e.preventDefault()
    setLookupStatus('')
    if (!lookupEmail.trim()) return
    try {
      const entry = await findEntryByEmail(tournament.id, lookupEmail)
      if (!entry) {
        setLookupStatus('No entry found for that email.')
        return
      }
      loadFromEntry(entry)
      setMode('edit')
    } catch (err) {
      setLookupStatus(err instanceof Error ? err.message : 'Lookup failed')
    }
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault()
    setError('')

    if (TIER_IDS.some((t) => !picks[t])) {
      setError('Pick one golfer from each tier')
      return
    }
    const tb = Number(tiebreak)
    if (!Number.isInteger(tb)) {
      setError('Tiebreak must be a whole number')
      return
    }

    setBusy(true)
    try {
      const normalizedEmail = email.toLowerCase().trim()
      if (editingId) {
        await updateEntry(editingId, {
          entryName: entryName.trim(),
          email: normalizedEmail,
          picks,
          tiebreak: tb,
        })
        setConfirmed({
          id: editingId,
          tournamentId: tournament.id,
          entryName: entryName.trim(),
          email: normalizedEmail,
          picks,
          tiebreak: tb,
          paid: false,
          submittedAt: new Date().toISOString(),
        })
      } else {
        const existing = await findEntryByEmail(tournament.id, normalizedEmail)
        if (existing) {
          await updateEntry(existing.id, {
            entryName: entryName.trim(),
            email: normalizedEmail,
            picks,
            tiebreak: tb,
          })
          const updated = { ...existing, entryName: entryName.trim(), picks, tiebreak: tb }
          setConfirmed(updated)
          onCreated(updated)
        } else {
          const newEntry: Omit<Entry, 'id'> = {
            tournamentId: tournament.id,
            entryName: entryName.trim(),
            email: normalizedEmail,
            picks,
            tiebreak: tb,
            paid: false,
            submittedAt: new Date().toISOString(),
          }
          const id = await createEntry(newEntry)
          const full = { id, ...newEntry }
          setConfirmed(full)
          onCreated(full)
        }
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Submit failed')
    } finally {
      setBusy(false)
    }
  }

  if (confirmed) {
    return (
      <div className="card">
        <h3>{editingId ? 'Picks updated' : "You're in!"}</h3>
        <p>
          Team: <strong>{confirmed.entryName}</strong>
        </p>
        <p>Tiebreak: {confirmed.tiebreak}</p>
        <p className="muted">Your picks:</p>
        <ul className="pick-summary">
          {TIER_IDS.map((t) => (
            <li key={t}>
              <span className="muted">
                {tournament.tiers[t]?.label ?? TIER_LABELS[t]}:
              </span>{' '}
              {confirmed.picks[t]}
            </li>
          ))}
        </ul>
        {!editingId && (
          <p className="muted">Pay your commissioner to appear in the standings.</p>
        )}
        <div className="actions">
          <button className="btn" onClick={startFresh}>
            Submit another team
          </button>
        </div>
      </div>
    )
  }

  if (mode === 'choose') {
    return (
      <div className="card entry-choice">
        <h3>Get into the pool</h3>
        <p className="muted">Pick one:</p>
        <div className="entry-choice-buttons">
          <button
            type="button"
            className="btn btn-primary entry-choice-btn"
            onClick={() => setMode('new')}
          >
            Submit a new team
          </button>
          <button
            type="button"
            className="btn btn-primary entry-choice-btn"
            onClick={() => setMode('lookup')}
          >
            Edit an existing team
          </button>
        </div>
      </div>
    )
  }

  if (mode === 'lookup') {
    return (
      <div className="card">
        <div className="form-header">
          <h3>Find your entry</h3>
          <button type="button" className="link-btn" onClick={startFresh}>
            Back
          </button>
        </div>
        <form onSubmit={handleLookup} className="form">
          <label>
            <span>Your email</span>
            <input
              type="email"
              value={lookupEmail}
              onChange={(e) => setLookupEmail(e.target.value)}
              placeholder="you@example.com"
              autoFocus
              required
            />
          </label>
          {lookupStatus && <p className="error">{lookupStatus}</p>}
          <button type="submit" className="btn btn-primary">
            Find my entry
          </button>
        </form>
      </div>
    )
  }

  return (
    <div className="card">
      <div className="form-header">
        <h3>{mode === 'edit' ? 'Edit your picks' : 'Submit a new team'}</h3>
        <button type="button" className="link-btn" onClick={startFresh}>
          Cancel
        </button>
      </div>

      <form onSubmit={handleSubmit} className="form">
        <div className="row">
          <label>
            <span>Team name</span>
            <input
              type="text"
              value={entryName}
              onChange={(e) => setEntryName(e.target.value)}
              required
            />
          </label>
          <label>
            <span>Email</span>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              disabled={editingId !== null}
            />
          </label>
        </div>

        {TIER_IDS.map((tier) => (
          <label key={tier}>
            <span>{tournament.tiers[tier]?.label ?? TIER_LABELS[tier]}</span>
            <select
              value={picks[tier]}
              onChange={(e) => setPicks({ ...picks, [tier]: e.target.value })}
              required
            >
              <option value="">— choose —</option>
              {(tournament.tiers[tier]?.golfers ?? []).map((g) => (
                <option key={g} value={g}>
                  {g}
                </option>
              ))}
            </select>
          </label>
        ))}

        <label>
          <span>Tiebreak — predicted winning total score (whole number)</span>
          <input
            type="number"
            value={tiebreak}
            onChange={(e) => setTiebreak(e.target.value)}
            step="1"
            required
            placeholder="-15"
          />
        </label>

        {error && <p className="error">{error}</p>}
        <button type="submit" className="btn btn-primary" disabled={busy}>
          {busy ? 'Saving…' : editingId ? 'Update picks' : 'Submit picks'}
        </button>
      </form>
    </div>
  )
}

