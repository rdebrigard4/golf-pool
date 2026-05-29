import { useEffect, useMemo, useState } from 'react'
import type { FormEvent } from 'react'
import type { User } from 'firebase/auth'
import { signIn, signOut, subscribeUser } from '../lib/auth'
import {
  activateTournament,
  deleteEntry,
  saveGolferScore,
  saveTournament,
  subscribeActiveTournament,
  subscribeEntries,
  subscribeGolferScores,
  updateEntry,
  updateTournament,
} from '../lib/storage'
import type { Entry, GolferScore, GolferStatus, TierId, Tournament } from '../types'
import { TIER_IDS, TIER_LABELS } from '../types'

const ADMIN_EMAIL = 'rdebrigard4@gmail.com'

type AdminTab = 'setup' | 'entries' | 'scoring'

export default function Admin() {
  const [user, setUser] = useState<User | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    return subscribeUser((u) => {
      setUser(u)
      setLoading(false)
    })
  }, [])

  if (loading) return <p className="muted">Loading…</p>
  if (!user) return <LoginForm />
  if (user.email !== ADMIN_EMAIL) return <NotAuthorized email={user.email ?? ''} />
  return <AdminPanel user={user} />
}

function LoginForm() {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)

  async function handleSubmit(e: FormEvent) {
    e.preventDefault()
    setBusy(true)
    setError('')
    try {
      await signIn(email, password)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Sign in failed')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="card admin-card">
      <h2>Admin login</h2>
      <form onSubmit={handleSubmit} className="form">
        <label>
          <span>Email</span>
          <input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
            autoComplete="email"
          />
        </label>
        <label>
          <span>Password</span>
          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
            autoComplete="current-password"
          />
        </label>
        {error && <p className="error">{error}</p>}
        <button type="submit" className="btn btn-primary" disabled={busy}>
          {busy ? 'Signing in…' : 'Sign in'}
        </button>
      </form>
    </div>
  )
}

function NotAuthorized({ email }: { email: string }) {
  return (
    <div className="card">
      <h2>Not authorized</h2>
      <p>
        Signed in as <strong>{email}</strong>, which isn't the admin account.
      </p>
      <button className="btn" onClick={() => signOut()}>
        Sign out
      </button>
    </div>
  )
}

function AdminPanel({ user }: { user: User }) {
  const [active, setActive] = useState<Tournament | null>(null)
  const [tab, setTab] = useState<AdminTab>('setup')

  useEffect(() => subscribeActiveTournament(setActive), [])

  return (
    <div>
      <div className="admin-header">
        <h2>Admin</h2>
        <div className="admin-user">
          <span className="muted">{user.email}</span>
          <button className="btn" onClick={() => signOut()}>
            Sign out
          </button>
        </div>
      </div>

      <nav className="admin-tabs">
        <button
          className={tab === 'setup' ? 'active' : ''}
          onClick={() => setTab('setup')}
        >
          Tournament Setup
        </button>
        <button
          className={tab === 'entries' ? 'active' : ''}
          onClick={() => setTab('entries')}
        >
          Entries
        </button>
        <button
          className={tab === 'scoring' ? 'active' : ''}
          onClick={() => setTab('scoring')}
        >
          Golfer Scores
        </button>
      </nav>

      {tab === 'setup' && (
        <>
          <ActiveTournamentSection tournament={active} />
          <CreateTournamentForm />
        </>
      )}
      {tab === 'entries' &&
        (active ? (
          <EntriesTab tournament={active} />
        ) : (
          <NoActiveMessage />
        ))}
      {tab === 'scoring' &&
        (active ? (
          <ScoringTab tournament={active} />
        ) : (
          <NoActiveMessage />
        ))}
    </div>
  )
}

function NoActiveMessage() {
  return (
    <div className="card">
      <p className="muted">No active tournament — create one in the Setup tab.</p>
    </div>
  )
}

function ActiveTournamentSection({ tournament }: { tournament: Tournament | null }) {
  if (!tournament) {
    return (
      <div className="card">
        <h3>Active tournament</h3>
        <p className="muted">None yet — create one below.</p>
      </div>
    )
  }

  return (
    <div className="card">
      <h3>Active tournament</h3>
      <p>
        <strong>{tournament.name}</strong> ({tournament.year}) — first tee:{' '}
        {new Date(tournament.firstTeeTime).toLocaleString()}
      </p>
      <p className="muted">Entry fee: ${tournament.entryFee}</p>
      <div className="actions">
        <label className="inline-toggle">
          <input
            type="checkbox"
            checked={tournament.lockedManually}
            onChange={(e) =>
              updateTournament(tournament.id, { lockedManually: e.target.checked })
            }
          />
          <span>Manually lock entries</span>
        </label>
        {!tournament.isComplete && (
          <button
            className="btn btn-danger"
            onClick={() => {
              if (!confirm('Mark this tournament complete? It will move to History.')) return
              updateTournament(tournament.id, { isComplete: true, isActive: false })
            }}
          >
            Mark complete
          </button>
        )}
      </div>
    </div>
  )
}

interface TierFormState {
  tier1: string
  tier2: string
  tier3: string
  tier4: string
  tier5a: string
  tier5b: string
}

function CreateTournamentForm() {
  const [open, setOpen] = useState(false)
  const [name, setName] = useState('')
  const [year, setYear] = useState(new Date().getFullYear())
  const [firstTeeTime, setFirstTeeTime] = useState('')
  const [entryFee, setEntryFee] = useState(20)
  const [tiers, setTiers] = useState<TierFormState>({
    tier1: '',
    tier2: '',
    tier3: '',
    tier4: '',
    tier5a: '',
    tier5b: '',
  })
  const [busy, setBusy] = useState(false)
  const [done, setDone] = useState('')

  async function handleSubmit(e: FormEvent) {
    e.preventDefault()
    if (!name.trim() || !firstTeeTime) return
    setBusy(true)
    setDone('')
    try {
      const slug = name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')
      const id = `${slug}-${year}`
      const parsedTiers = {} as Tournament['tiers']
      for (const tier of TIER_IDS) {
        parsedTiers[tier] = {
          label: TIER_LABELS[tier],
          golfers: tiers[tier]
            .split('\n')
            .map((s) => s.trim())
            .filter(Boolean),
        }
      }
      const t: Tournament = {
        id,
        name: name.trim(),
        year,
        firstTeeTime: new Date(firstTeeTime).toISOString(),
        lockedManually: false,
        isActive: true,
        isComplete: false,
        entryFee,
        payoutStructure: [],
        tiers: parsedTiers,
      }
      await saveTournament(t)
      await activateTournament(id)
      setDone(`Created "${t.name}"`)
      setName('')
      setFirstTeeTime('')
      setTiers({ tier1: '', tier2: '', tier3: '', tier4: '', tier5a: '', tier5b: '' })
    } catch (err) {
      setDone(err instanceof Error ? err.message : 'Failed to create')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="card">
      <button
        type="button"
        className="collapsible-header"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
      >
        <h3>Create tournament</h3>
        <span className="collapse-chevron">{open ? '−' : '+'}</span>
      </button>
      {!open ? null : (
      <>
      <p className="muted">
        Creates a new tournament and makes it active. Any previous active tournament becomes
        inactive.
      </p>
      <form onSubmit={handleSubmit} className="form">
        <div className="row">
          <label>
            <span>Name</span>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Masters"
              required
            />
          </label>
          <label>
            <span>Year</span>
            <input
              type="number"
              value={year}
              onChange={(e) => setYear(Number(e.target.value))}
              min={2000}
              max={2100}
              required
            />
          </label>
        </div>

        <div className="row">
          <label>
            <span>First tee time</span>
            <input
              type="datetime-local"
              value={firstTeeTime}
              onChange={(e) => setFirstTeeTime(e.target.value)}
              required
            />
          </label>
          <label>
            <span>Entry fee ($)</span>
            <input
              type="number"
              value={entryFee}
              onChange={(e) => setEntryFee(Number(e.target.value))}
              min={0}
              required
            />
          </label>
        </div>

        <fieldset>
          <legend>Tiers (one golfer per line)</legend>
          {TIER_IDS.map((tier) => (
            <label key={tier}>
              <span>{TIER_LABELS[tier]}</span>
              <textarea
                rows={4}
                value={tiers[tier]}
                onChange={(e) => setTiers({ ...tiers, [tier]: e.target.value })}
                placeholder="Scottie Scheffler"
              />
            </label>
          ))}
        </fieldset>

        {done && <p className="muted">{done}</p>}
        <button type="submit" className="btn btn-primary" disabled={busy}>
          {busy ? 'Creating…' : 'Create tournament'}
        </button>
      </form>
      </>
      )}
    </div>
  )
}

function EntriesTab({ tournament }: { tournament: Tournament }) {
  const [entries, setEntries] = useState<Entry[]>([])
  const [pendingPaid, setPendingPaid] = useState<Record<string, boolean>>({})

  useEffect(() => subscribeEntries(tournament.id, setEntries), [tournament.id])

  useEffect(() => {
    setPendingPaid((prev) => {
      let changed = false
      const next = { ...prev }
      for (const e of entries) {
        if (e.id in prev && prev[e.id] === e.paid) {
          delete next[e.id]
          changed = true
        }
      }
      return changed ? next : prev
    })
  }, [entries])

  function paidView(e: Entry): boolean {
    return e.id in pendingPaid ? pendingPaid[e.id] : e.paid
  }

  const paidCount = entries.filter(paidView).length
  const pot = paidCount * tournament.entryFee

  function exportCsv() {
    const headers = [
      'Team',
      'Email',
      'Paid',
      'Tiebreak',
      ...TIER_IDS.map((t) => tournament.tiers[t]?.label ?? TIER_LABELS[t]),
      'Submitted',
    ]
    const rows = entries.map((e) => [
      e.entryName,
      e.email,
      e.paid ? 'yes' : 'no',
      String(e.tiebreak),
      ...TIER_IDS.map((t) => e.picks[t] ?? ''),
      new Date(e.submittedAt).toISOString(),
    ])
    const csv = [headers, ...rows]
      .map((r) => r.map((c) => `"${String(c).replace(/"/g, '""')}"`).join(','))
      .join('\n')
    const blob = new Blob([csv], { type: 'text/csv' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `${tournament.id}-entries.csv`
    document.body.appendChild(a)
    a.click()
    document.body.removeChild(a)
    URL.revokeObjectURL(url)
  }

  return (
    <div className="card">
      <div className="entries-header">
        <div>
          <h3>Entries ({entries.length})</h3>
          <p className="muted">
            {paidCount} paid · pot ${pot}
          </p>
        </div>
        <button className="btn" onClick={exportCsv} disabled={entries.length === 0}>
          Export CSV
        </button>
      </div>

      {entries.length === 0 ? (
        <p className="muted">No entries yet.</p>
      ) : (
        <table className="entries-table">
          <thead>
            <tr>
              <th>Team</th>
              <th>Email</th>
              <th>TB</th>
              <th>Paid</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {entries.map((e) => (
              <tr key={e.id}>
                <td>
                  <details>
                    <summary>
                      <strong>{e.entryName}</strong>
                    </summary>
                    <ul className="pick-summary">
                      {TIER_IDS.map((t) => (
                        <li key={t}>
                          <span className="muted">
                            {tournament.tiers[t]?.label ?? TIER_LABELS[t]}:
                          </span>{' '}
                          {e.picks[t]}
                        </li>
                      ))}
                    </ul>
                  </details>
                </td>
                <td className="cell-email">{e.email}</td>
                <td>{e.tiebreak}</td>
                <td>
                  <input
                    type="checkbox"
                    checked={paidView(e)}
                    onChange={async () => {
                      const newVal = !paidView(e)
                      setPendingPaid((prev) => ({ ...prev, [e.id]: newVal }))
                      try {
                        await updateEntry(e.id, { paid: newVal })
                      } catch (err) {
                        setPendingPaid((prev) => {
                          const next = { ...prev }
                          delete next[e.id]
                          return next
                        })
                        alert(
                          'Could not update paid status:\n' +
                            (err instanceof Error ? err.message : String(err)),
                        )
                      }
                    }}
                  />
                </td>
                <td>
                  <button
                    className="link-btn muted-link"
                    onClick={() => {
                      if (confirm(`Delete entry "${e.entryName}"?`)) deleteEntry(e.id)
                    }}
                  >
                    Delete
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  )
}

function ScoringTab({ tournament }: { tournament: Tournament }) {
  const [scores, setScores] = useState<GolferScore[]>([])

  useEffect(() => subscribeGolferScores(tournament.id, setScores), [tournament.id])

  const scoresMap = useMemo(() => {
    const m = new Map<string, GolferScore>()
    for (const s of scores) m.set(s.name, s)
    return m
  }, [scores])

  return (
    <div>
      {TIER_IDS.map((tier) => {
        const golfers = tournament.tiers[tier]?.golfers ?? []
        if (golfers.length === 0) return null
        return (
          <div key={tier} className="card">
            <h3>{tournament.tiers[tier]?.label ?? TIER_LABELS[tier]}</h3>
            <div className="scoring-list">
              <div className="scoring-row scoring-head">
                <div className="scoring-name">Golfer</div>
                <div className="scoring-fields">
                  <span>R1</span>
                  <span>R2</span>
                  <span>R3</span>
                  <span>R4</span>
                  <span>Status</span>
                  <span>WD Rd</span>
                  <span></span>
                </div>
              </div>
              {golfers.map((name) => (
                <ScoringRow
                  key={name}
                  tournament={tournament}
                  golferName={name}
                  tier={tier}
                  current={scoresMap.get(name) ?? null}
                />
              ))}
            </div>
          </div>
        )
      })}
    </div>
  )
}

function ScoringRow({
  tournament,
  golferName,
  tier,
  current,
}: {
  tournament: Tournament
  golferName: string
  tier: TierId
  current: GolferScore | null
}) {
  const [r1, setR1] = useState(current?.rounds.r1?.toString() ?? '')
  const [r2, setR2] = useState(current?.rounds.r2?.toString() ?? '')
  const [r3, setR3] = useState(current?.rounds.r3?.toString() ?? '')
  const [r4, setR4] = useState(current?.rounds.r4?.toString() ?? '')
  const [status, setStatus] = useState<GolferStatus>(current?.status ?? 'active')
  const [wdRound, setWdRound] = useState(current?.wdRound?.toString() ?? '')
  const [busy, setBusy] = useState(false)
  const [dirty, setDirty] = useState(false)

  useEffect(() => {
    if (!current) return
    if (dirty) return
    setR1(current.rounds.r1?.toString() ?? '')
    setR2(current.rounds.r2?.toString() ?? '')
    setR3(current.rounds.r3?.toString() ?? '')
    setR4(current.rounds.r4?.toString() ?? '')
    setStatus(current.status)
    setWdRound(current.wdRound?.toString() ?? '')
  }, [current?.lastUpdated, dirty])

  function parseRound(v: string): number | null {
    if (v.trim() === '') return null
    const n = Number(v)
    return Number.isFinite(n) ? n : null
  }

  async function save() {
    setBusy(true)
    try {
      const slug = `${tournament.id}--${golferName.toLowerCase().replace(/[^a-z0-9]+/g, '-')}`
      const rounds = {
        r1: parseRound(r1),
        r2: parseRound(r2),
        r3: parseRound(r3),
        r4: parseRound(r4),
      }
      const score: GolferScore = {
        id: slug,
        tournamentId: tournament.id,
        name: golferName,
        tier,
        rounds,
        status,
        lastUpdated: new Date().toISOString(),
      }
      if (status === 'wd' || status === 'dq') {
        const wd = Number(wdRound)
        if (wd >= 1 && wd <= 4) score.wdRound = wd as 1 | 2 | 3 | 4
      }
      await saveGolferScore(score)
      setDirty(false)
    } catch (err) {
      console.error('save score:', err)
    } finally {
      setBusy(false)
    }
  }

  const showWd = status === 'wd' || status === 'dq'

  function mark<T>(setter: (v: T) => void) {
    return (v: T) => {
      setter(v)
      setDirty(true)
    }
  }

  return (
    <div className="scoring-row">
      <div className="scoring-name">{golferName}</div>
      <div className="scoring-fields">
        <input
          type="number"
          value={r1}
          onChange={(e) => mark(setR1)(e.target.value)}
          step="1"
        />
        <input
          type="number"
          value={r2}
          onChange={(e) => mark(setR2)(e.target.value)}
          step="1"
        />
        <input
          type="number"
          value={r3}
          onChange={(e) => mark(setR3)(e.target.value)}
          step="1"
        />
        <input
          type="number"
          value={r4}
          onChange={(e) => mark(setR4)(e.target.value)}
          step="1"
        />
        <select value={status} onChange={(e) => mark(setStatus)(e.target.value as GolferStatus)}>
          <option value="active">Active</option>
          <option value="complete">Complete</option>
          <option value="cut">Cut</option>
          <option value="wd">WD</option>
          <option value="dq">DQ</option>
        </select>
        <input
          type="number"
          min={1}
          max={4}
          value={showWd ? wdRound : ''}
          onChange={(e) => mark(setWdRound)(e.target.value)}
          disabled={!showWd}
          className="wd-round"
          placeholder="—"
        />
        <button
          onClick={save}
          disabled={busy || !dirty}
          className={`btn scoring-save ${dirty ? 'btn-primary' : ''}`}
        >
          {busy ? '…' : 'Save'}
        </button>
      </div>
    </div>
  )
}
