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
import {
  defaultPayout,
  rankEntries,
  scoreGolferForTeam,
  winningGolferScore,
} from '../lib/scoring'
import { TIER_IDS, TIER_LABELS } from '../types'
import type {
  Entry,
  GolferScore,
  PayoutSlot,
  TierId,
  Tournament,
} from '../types'

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
    return <Leaderboard tournament={tournament} entries={entries} scores={scores} />
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
  const [lookupOpen, setLookupOpen] = useState(false)
  const [lookupEmail, setLookupEmail] = useState('')
  const [lookupStatus, setLookupStatus] = useState('')

  useEffect(() => {
    if (editTarget) {
      loadFromEntry(editTarget)
      setConfirmed(null)
    }
  }, [editTarget?.id])

  function loadFromEntry(entry: Entry) {
    setEntryName(entry.entryName)
    setEmail(entry.email)
    setPicks(entry.picks)
    setTiebreak(String(entry.tiebreak))
    setEditingId(entry.id)
    setLookupOpen(false)
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

  return (
    <div className="card">
      <div className="form-header">
        <h3>{editingId ? 'Edit your picks' : 'Submit your picks'}</h3>
        {!editingId && (
          <button
            type="button"
            className="link-btn"
            onClick={() => setLookupOpen((v) => !v)}
          >
            {lookupOpen ? 'Cancel' : 'Edit existing entry by email'}
          </button>
        )}
        {editingId && (
          <button type="button" className="link-btn" onClick={startFresh}>
            Cancel edit
          </button>
        )}
      </div>

      {lookupOpen && (
        <form onSubmit={handleLookup} className="form lookup-form">
          <label>
            <span>Your email</span>
            <input
              type="email"
              value={lookupEmail}
              onChange={(e) => setLookupEmail(e.target.value)}
              placeholder="you@example.com"
              required
            />
          </label>
          {lookupStatus && <p className="error">{lookupStatus}</p>}
          <button type="submit" className="btn">
            Find my entry
          </button>
        </form>
      )}

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

function formatScore(n: number): string {
  if (n === 0) return 'E'
  if (n > 0) return `+${n}`
  return String(n)
}

function Leaderboard({
  tournament,
  entries,
  scores,
}: {
  tournament: Tournament
  entries: Entry[]
  scores: GolferScore[]
}) {
  const paidEntries = useMemo(() => entries.filter((e) => e.paid), [entries])

  const golfersMap = useMemo(() => {
    const m = new Map<string, GolferScore>()
    for (const s of scores) m.set(s.name, s)
    return m
  }, [scores])

  const winning = winningGolferScore(scores)

  const pot = paidEntries.length * tournament.entryFee
  const payoutStructure: PayoutSlot[] =
    tournament.payoutStructure && tournament.payoutStructure.length > 0
      ? tournament.payoutStructure
      : defaultPayout(pot)

  const ranked = useMemo(
    () => rankEntries(entries, golfersMap, winning, payoutStructure),
    [entries, golfersMap, winning, payoutStructure],
  )

  return (
    <div>
      <div className="card hero">
        <h2 className="hero-name">
          {tournament.name} <span className="hero-year">{tournament.year}</span>
        </h2>
        <div className="hero-divider" />
        <div className="leaderboard-status">
          <span className="live-badge">LIVE</span>
          <span className="muted">
            {paidEntries.length} {paidEntries.length === 1 ? 'team' : 'teams'} · pot ${pot}
          </span>
        </div>
        {scores.length > 0 && winning < Infinity && (
          <p className="hero-subtle">
            Leader at {formatScore(winning)}
          </p>
        )}
      </div>

      {ranked.length === 0 ? (
        <div className="card">
          <p className="muted">No paid entries yet. The leaderboard will fill in here.</p>
        </div>
      ) : (
        <div className="card lb-wrap">
          <table className="lb-grid">
            <thead>
              <tr>
                <th className="col-rank">#</th>
                <th className="col-team">Team</th>
                {TIER_IDS.map((t) => (
                  <th key={t} className="col-tier">
                    {tournament.tiers[t]?.label ?? TIER_LABELS[t]}
                  </th>
                ))}
                <th className="col-tb">TB</th>
                <th className="col-total">Total</th>
                <th className="col-payout">Payout</th>
              </tr>
            </thead>
            <tbody>
              {ranked.map((r) => (
                <tr key={r.entry.id}>
                  <td className="col-rank">{r.rank}</td>
                  <td className="col-team">{r.entry.entryName}</td>
                  {TIER_IDS.map((t) => {
                    const golfer = golfersMap.get(r.entry.picks[t])
                    let contribution: number | null = null
                    if (golfer) {
                      contribution = scoreGolferForTeam(
                        golfer,
                        t,
                        paidEntries,
                        golfersMap,
                      )
                    }
                    const flag =
                      golfer?.status === 'cut'
                        ? 'CUT'
                        : golfer?.status === 'wd'
                          ? 'WD'
                          : golfer?.status === 'dq'
                            ? 'DQ'
                            : null
                    return (
                      <td key={t} className="col-tier">
                        <div className="cell-content">
                          <span className="cell-golfer">
                            {r.entry.picks[t]}
                            {flag && <span className="lb-pick-flag">{flag}</span>}
                          </span>
                          <span className="cell-score">
                            {contribution !== null ? formatScore(contribution) : '—'}
                          </span>
                        </div>
                      </td>
                    )
                  })}
                  <td className="col-tb">{r.entry.tiebreak}</td>
                  <td className="col-total">{formatScore(r.total)}</td>
                  <td className="col-payout">
                    {r.payout > 0 ? `$${r.payout}` : '—'}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
