import { useEffect, useMemo, useState } from 'react'
import type { ChangeEvent, FormEvent } from 'react'
import type { User } from 'firebase/auth'
import { signIn, signOut, subscribeUser } from '../lib/auth'
import {
  activateTournament,
  deleteEntry,
  saveGolferScore,
  saveTournament,
  setEntry,
  subscribeActiveTournament,
  subscribeEntries,
  subscribeGolferScores,
  updateEntry,
  updateTournament,
} from '../lib/storage'
import type { Entry, GolferScore, GolferStatus, TierId, Tournament } from '../types'
import { TIER_IDS, TIER_LABELS } from '../types'
import { buildImport } from '../lib/importEntries'
import type { ImportPreview } from '../lib/importEntries'

const ADMIN_EMAILS = ['rdebrigard4@gmail.com', 'skinney1007@gmail.com']

function isAdminEmail(email: string | null | undefined): boolean {
  return !!email && ADMIN_EMAILS.includes(email.toLowerCase())
}

type TournamentTab = 'entries' | 'scorers' | 'settings'

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
  if (!isAdminEmail(user.email)) return <NotAuthorized email={user.email ?? ''} />
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
  const [view, setView] = useState<'landing' | 'tournament'>('landing')

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

      {view === 'tournament' && active ? (
        <TournamentAdmin tournament={active} onBack={() => setView('landing')} />
      ) : (
        <AdminLanding active={active} onManage={() => setView('tournament')} />
      )}
    </div>
  )
}

function formatTee(iso: string): string {
  return new Date(iso).toLocaleString(undefined, {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
    timeZoneName: 'short',
  })
}

function AdminLanding({
  active,
  onManage,
}: {
  active: Tournament | null
  onManage: () => void
}) {
  const activeTournaments = active ? [active] : []

  return (
    <>
      <h3 className="admin-section-title">Active Tournaments</h3>
      {activeTournaments.length === 0 ? (
        <div className="card">
          <p className="muted">None active — create one below to start taking entries.</p>
        </div>
      ) : (
        activeTournaments.map((t) => (
          <div key={t.id} className="card active-tournament-card">
            <div className="active-tournament-info">
              <h3 className="active-tournament-title">
                {t.name} <span className="active-tournament-year">{t.year}</span>
              </h3>
              <dl className="active-tournament-meta">
                <div>
                  <dt>First tee</dt>
                  <dd>{formatTee(t.firstTeeTime)}</dd>
                </div>
                <div>
                  <dt>Entry fee</dt>
                  <dd>${t.entryFee}</dd>
                </div>
              </dl>
            </div>
            <button
              className="btn btn-primary active-tournament-manage"
              onClick={onManage}
            >
              Manage →
            </button>
          </div>
        ))
      )}
      <CreateTournamentForm />
    </>
  )
}

function TournamentAdmin({
  tournament,
  onBack,
}: {
  tournament: Tournament
  onBack: () => void
}) {
  const [tab, setTab] = useState<TournamentTab>('entries')

  return (
    <div>
      <button type="button" className="link-btn muted-link" onClick={onBack}>
        ← All tournaments
      </button>

      <div className="card">
        <h3>
          {tournament.name} ({tournament.year})
        </h3>
        <p className="muted">
          First tee: {formatTee(tournament.firstTeeTime)} · Entry fee: $
          {tournament.entryFee}
        </p>
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

      <nav className="admin-tabs">
        <button
          className={tab === 'entries' ? 'active' : ''}
          onClick={() => setTab('entries')}
        >
          Entries
        </button>
        <button
          className={tab === 'scorers' ? 'active' : ''}
          onClick={() => setTab('scorers')}
        >
          Scorers
        </button>
        <button
          className={tab === 'settings' ? 'active' : ''}
          onClick={() => setTab('settings')}
        >
          Settings
        </button>
      </nav>

      {tab === 'entries' && <EntriesTab tournament={tournament} />}
      {tab === 'scorers' && <ScoringTab tournament={tournament} />}
      {tab === 'settings' && (
        <SettingsTab key={tournament.id} tournament={tournament} />
      )}
    </div>
  )
}

function tiersToForm(t: Tournament): TierFormState {
  const form = {} as TierFormState
  for (const tier of TIER_IDS) {
    form[tier] = (t.tiers[tier]?.golfers ?? []).join('\n')
  }
  return form
}

function SettingsTab({ tournament }: { tournament: Tournament }) {
  const [espnEventId, setEspnEventId] = useState(tournament.espnEventId ?? '')
  const [entryFee, setEntryFee] = useState(tournament.entryFee)
  const [tiers, setTiers] = useState<TierFormState>(() => tiersToForm(tournament))
  const [busy, setBusy] = useState(false)
  const [done, setDone] = useState('')

  // State seeds from props on mount; the `key={tournament.id}` at the render
  // site remounts this form if the active tournament ever swaps, so an
  // in-flight edit is never clobbered by an onSnapshot refresh (e.g. lock toggle).

  async function save(e: FormEvent) {
    e.preventDefault()
    setBusy(true)
    setDone('')
    try {
      const parsedTiers = {} as Tournament['tiers']
      for (const tier of TIER_IDS) {
        parsedTiers[tier] = {
          label: tournament.tiers[tier]?.label ?? TIER_LABELS[tier],
          golfers: tiers[tier]
            .split('\n')
            .map((s) => s.trim())
            .filter(Boolean),
        }
      }
      await updateTournament(tournament.id, {
        // Empty string = "not configured"; avoids passing undefined to Firestore.
        espnEventId: espnEventId.trim(),
        entryFee,
        tiers: parsedTiers,
      })
      setDone('Saved')
    } catch (err) {
      setDone(err instanceof Error ? err.message : 'Failed to save')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="card">
      <h3>Settings</h3>
      <form onSubmit={save} className="form">
        <div className="row">
          <label>
            <span>ESPN event ID</span>
            <input
              type="text"
              value={espnEventId}
              onChange={(e) => setEspnEventId(e.target.value)}
              placeholder="401811952"
              inputMode="numeric"
            />
          </label>
          <label>
            <span>Entry fee ($)</span>
            <input
              type="number"
              value={entryFee}
              onChange={(e) => setEntryFee(Number(e.target.value))}
              min={0}
            />
          </label>
        </div>
        <p className="muted">
          ESPN event ID drives live scoring — it's the <code>tournamentId</code> in
          the ESPN leaderboard URL (e.g. 401811952 for the 2026 US Open).
        </p>

        <fieldset>
          <legend>Tiers (one golfer per line)</legend>
          {TIER_IDS.map((tier) => (
            <label key={tier}>
              <span>{tournament.tiers[tier]?.label ?? TIER_LABELS[tier]}</span>
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
          {busy ? 'Saving…' : 'Save settings'}
        </button>
      </form>
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
  const [entryFee, setEntryFee] = useState(25)
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
  const [preview, setPreview] = useState<ImportPreview | null>(null)
  const [importing, setImporting] = useState(false)
  const [importMsg, setImportMsg] = useState('')

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

  async function handleFile(e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    e.target.value = '' // allow re-picking the same file later
    if (!file) return
    setImportMsg('')
    try {
      const text = await file.text()
      setPreview(buildImport(text, tournament))
    } catch (err) {
      setImportMsg(err instanceof Error ? err.message : 'Could not read file')
    }
  }

  // Split the parsed entries into new vs existing against what's in Firestore.
  const existingIds = useMemo(() => new Set(entries.map((e) => e.id)), [entries])
  const previewCreate = preview?.entries.filter((p) => !existingIds.has(p.docId)).length ?? 0
  const previewUpdate = preview?.entries.filter((p) => existingIds.has(p.docId)).length ?? 0
  const previewIds = useMemo(
    () => new Set(preview?.entries.map((p) => p.docId) ?? []),
    [preview],
  )
  const previewRemoved = preview ? entries.filter((e) => !previewIds.has(e.id)) : []

  async function confirmImport() {
    if (!preview) return
    setImporting(true)
    try {
      const paidById = new Map(entries.map((e) => [e.id, e.paid]))
      for (const p of preview.entries) {
        // Preserve any paid flag already set on this entry.
        await setEntry(p.docId, { ...p.entry, paid: paidById.get(p.docId) ?? false })
      }
      setImportMsg(`Imported ${preview.entries.length} entr${preview.entries.length === 1 ? 'y' : 'ies'} (${previewCreate} new, ${previewUpdate} updated).`)
      setPreview(null)
    } catch (err) {
      setImportMsg(err instanceof Error ? err.message : 'Import failed')
    } finally {
      setImporting(false)
    }
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
        <div className="entries-actions">
          <label className="btn">
            Import CSV
            <input
              type="file"
              accept=".csv,text/csv"
              onChange={handleFile}
              style={{ display: 'none' }}
            />
          </label>
          <button className="btn" onClick={exportCsv} disabled={entries.length === 0}>
            Export CSV
          </button>
        </div>
      </div>

      {importMsg && <p className="import-msg">{importMsg}</p>}

      {preview && (
        <div className="import-preview">
          <h4>Import preview</h4>
          <p>
            {preview.rowCount} row{preview.rowCount === 1 ? '' : 's'} →{' '}
            <strong>{preview.entries.length}</strong> entr
            {preview.entries.length === 1 ? 'y' : 'ies'} ({previewCreate} new,{' '}
            {previewUpdate} updated)
            {previewRemoved.length > 0 && (
              <> · {previewRemoved.length} existing not in file (kept)</>
            )}
          </p>
          {preview.problems.length > 0 ? (
            <details open>
              <summary>
                ⚠️ {preview.problems.length} issue{preview.problems.length === 1 ? '' : 's'}
              </summary>
              <ul className="import-problems">
                {preview.problems.map((p, i) => (
                  <li key={i}>{p}</li>
                ))}
              </ul>
            </details>
          ) : (
            <p className="muted">✓ All picks validate; all tiebreaks parsed.</p>
          )}
          <div className="import-preview-actions">
            <button
              className="btn btn-primary"
              onClick={confirmImport}
              disabled={importing || preview.entries.length === 0}
            >
              {importing ? 'Importing…' : `Confirm import (${preview.entries.length})`}
            </button>
            <button className="btn" onClick={() => setPreview(null)} disabled={importing}>
              Cancel
            </button>
          </div>
        </div>
      )}

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
