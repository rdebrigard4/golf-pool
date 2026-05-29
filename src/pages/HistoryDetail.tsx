import { useParams } from 'react-router-dom'

export default function HistoryDetail() {
  const { tournamentId } = useParams()
  return (
    <div>
      <h2>Past Tournament</h2>
      <p className="muted">Final standings for {tournamentId}.</p>
    </div>
  )
}
