import { useDroppable } from '@dnd-kit/core'
import { SortableContext, verticalListSortingStrategy } from '@dnd-kit/sortable'
import { Plus } from 'lucide-react'
import FindingCard from './FindingCard.jsx'

const columnInfo = {
  open: { label: 'Open', tone: 'open' },
  accepted: { label: 'Accepted', tone: 'accepted' },
  dismissed: { label: 'Dismissed', tone: 'dismissed' },
}

function Column({ status, findings, evidenceByCode, onOpen, onMove, onCopy, onAdd }) {
  const { setNodeRef, isOver } = useDroppable({ id: `status:${status}`, data: { status } })
  const info = columnInfo[status]

  return (
    <section className={`kanban-column column-${info.tone} ${isOver ? 'column-over' : ''}`} ref={setNodeRef}>
      <header className="column-header">
        <div className={`column-dot ${info.tone}`} />
        <h2>{info.label}</h2><span className="column-count">{findings.length}</span>
        <button aria-label={`Add new ${info.label.toLowerCase()} task`} className="icon-button column-add" onClick={onAdd} type="button"><Plus size={17} /></button>
      </header>
      <SortableContext items={findings.map((finding) => finding._id)} strategy={verticalListSortingStrategy}>
        <div className="column-cards">
          {findings.map((finding) => (
            <FindingCard
              evidenceRecord={evidenceByCode[finding.evidence?.refCode]}
              finding={finding}
              key={finding._id}
              onCopy={() => onCopy(finding)}
              onMove={onMove}
              onOpen={() => onOpen(finding)}
            />
          ))}
          {findings.length === 0 && (
            <div className="drop-placeholder"><span>Drag a finding here...</span></div>
          )}
          <button className="add-task-button" onClick={onAdd} type="button"><Plus size={15} /> Add new task</button>
        </div>
      </SortableContext>
    </section>
  )
}

export default Column
