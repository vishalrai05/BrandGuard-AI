import { ShieldCheck } from 'lucide-react'
import Card from './Card.jsx'

function EmptyState() {
  return (
    <Card className="empty-state-card">
      <span className="empty-state-icon"><ShieldCheck size={22} /></span>
      <h2>Start a review</h2>
      <p>Paste your copy to check it against 13 rules and 11 verified facts.</p>
    </Card>
  )
}

export default EmptyState
