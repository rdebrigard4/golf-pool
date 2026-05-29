import { NavLink, Route, Routes } from 'react-router-dom'
import Home from './pages/Home'
import Stats from './pages/Stats'
import History from './pages/History'
import HistoryDetail from './pages/HistoryDetail'
import Admin from './pages/Admin'

export default function App() {
  return (
    <div className="app">
      <header className="app-header">
        <h1>Golf Pool</h1>
        <nav className="app-nav">
          <NavLink to="/" end>
            Pool
          </NavLink>
          <NavLink to="/stats">Stats</NavLink>
          <NavLink to="/history">History</NavLink>
          <NavLink to="/admin">Admin</NavLink>
        </nav>
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
    </div>
  )
}
