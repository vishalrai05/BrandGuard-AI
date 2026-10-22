import { ShieldCheck } from 'lucide-react'
import Card from './Card.jsx'

function EmptyState() {
  return (
    <Card className="empty-state-card">
      <span className="empty-state-icon"><ShieldCheck size={22} /></span>
      <h2>Ready for a brand check</h2>
      <p>Paste marketing copy to check approved terminology, rules, and facts. Every finding links back to its evidence.</p>
    </Card>
  )
}

export default EmptyState
