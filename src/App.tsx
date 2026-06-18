import { useEffect, useRef, useState } from 'react'
import { NavLink, Route, Routes } from 'react-router-dom'
import Home from './pages/Home'
import Stats from './pages/Stats'
import History from './pages/History'
import HistoryDetail from './pages/HistoryDetail'
import Admin from './pages/Admin'
import { subscribeActiveTournament } from './lib/storage'
import { isLocked } from './lib/dates'
import {
  applyFontScale,
  applyTheme,
  clampFontScale,
  FONT_SCALE_MAX,
  FONT_SCALE_MIN,
  FONT_SCALE_STEP,
  loadFontScale,
  loadTheme,
  saveFontScale,
  saveTheme,
} from './theme'
import type { Theme } from './theme'
import type { Tournament } from './types'

export default function App() {
  const [activeTournament, setActiveTournament] = useState<Tournament | null>(null)
  const [, setTick] = useState(0)
  const [theme, setTheme] = useState<Theme>(() => loadTheme())
  const [fontScale, setFontScale] = useState<number>(() => loadFontScale())
  const [settingsOpen, setSettingsOpen] = useState(false)
  const settingsRef = useRef<HTMLDivElement>(null)

  useEffect(() => subscribeActiveTournament(setActiveTournament), [])

  useEffect(() => {
    const id = setInterval(() => setTick((t) => t + 1), 30000)
    return () => clearInterval(id)
  }, [])

  useEffect(() => {
    applyTheme(theme)
    saveTheme(theme)
  }, [theme])

  useEffect(() => {
    applyFontScale(fontScale)
    saveFontScale(fontScale)
  }, [fontScale])

  // Close the settings menu on an outside click or Escape.
  useEffect(() => {
    if (!settingsOpen) return
    const onDown = (e: MouseEvent) => {
      if (!settingsRef.current?.contains(e.target as Node)) setSettingsOpen(false)
    }
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setSettingsOpen(false)
    }
    document.addEventListener('mousedown', onDown)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('mousedown', onDown)
      document.removeEventListener('keydown', onKey)
    }
  }, [settingsOpen])

  const bumpFont = (dir: 1 | -1) =>
    setFontScale((s) => clampFontScale(s + dir * FONT_SCALE_STEP))

  const tournamentStarted = !!activeTournament && isLocked(activeTournament)
  const homeLabel = tournamentStarted ? 'Leaderboard' : 'Home'

  return (
    <div className="app">
      <header className="app-header">
        <h1>Golf Pool</h1>
        <nav className="app-nav">
          <NavLink to="/" end>
            {homeLabel}
          </NavLink>
          <NavLink to="/stats">Stats</NavLink>
          <NavLink to="/history">History</NavLink>
          <NavLink to="/admin">Admin</NavLink>
        </nav>
        <div className="settings" ref={settingsRef}>
          <button
            type="button"
            className="settings-btn"
            aria-label="Settings"
            aria-expanded={settingsOpen}
            onClick={() => setSettingsOpen((o) => !o)}
          >
            ⚙
          </button>
          {settingsOpen && (
            <div className="settings-panel" role="region" aria-label="Settings">
              <div className="setting-row">
                <span className="setting-label">Theme</span>
                <button
                  type="button"
                  className="btn btn-sm"
                  onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')}
                >
                  {theme === 'dark' ? '☾ Dark' : '☀ Light'}
                </button>
              </div>
              <div className="setting-row">
                <span className="setting-label">Text size</span>
                <div className="font-controls">
                  <button
                    type="button"
                    className="btn btn-sm"
                    aria-label="Decrease text size"
                    disabled={fontScale <= FONT_SCALE_MIN}
                    onClick={() => bumpFont(-1)}
                  >
                    A−
                  </button>
                  <span className="font-pct">{Math.round(fontScale * 100)}%</span>
                  <button
                    type="button"
                    className="btn btn-sm"
                    aria-label="Increase text size"
                    disabled={fontScale >= FONT_SCALE_MAX}
                    onClick={() => bumpFont(1)}
                  >
                    A+
                  </button>
                </div>
              </div>
            </div>
          )}
        </div>
      </header>
      <main className="app-main">
        <Routes>
          <Route path="/" element={<Home />} />
          <Route path="/stats" element={<Stats />} />
          <Route path="/history" element={<History />} />
          <Route path="/history/:tournamentId" element={<HistoryDetail />} />
          <Route path="/admin" element={<Admin />} />
        </Routes>
      </main>
      <footer className="app-footer">build {__BUILD_ID__}</footer>
    </div>
  )
}
