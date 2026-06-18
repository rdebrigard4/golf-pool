import { useEffect, useState } from 'react'
import { NavLink, Route, Routes } from 'react-router-dom'
import Home from './pages/Home'
import Stats from './pages/Stats'
import History from './pages/History'
import HistoryDetail from './pages/HistoryDetail'
import Admin from './pages/Admin'
import { subscribeActiveTournament } from './lib/storage'
import { isLocked } from './lib/dates'
import { applyTheme, loadTheme, saveTheme } from './theme'
import type { Theme } from './theme'
import type { Tournament } from './types'

export default function App() {
  const [activeTournament, setActiveTournament] = useState<Tournament | null>(null)
  const [, setTick] = useState(0)
  const [theme, setTheme] = useState<Theme>(() => loadTheme())

  useEffect(() => subscribeActiveTournament(setActiveTournament), [])

  useEffect(() => {
    const id = setInterval(() => setTick((t) => t + 1), 30000)
    return () => clearInterval(id)
  }, [])

  useEffect(() => {
    applyTheme(theme)
    saveTheme(theme)
  }, [theme])

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
        <button
          type="button"
          className="theme-btn"
          onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')}
          aria-label={`Switch to ${theme === 'dark' ? 'light' : 'dark'} mode`}
        >
          {theme === 'dark' ? '☀' : '☾'}
        </button>
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
