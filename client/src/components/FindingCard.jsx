import { useState } from 'react'
import { useSortable } from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import { Check, GripVertical, MoreHorizontal, Undo2 } from 'lucide-react'
import { findingTypeLabel } from '../utils/findingLabels.js'
import Pill from './Pill.jsx'

function FindingCard({ finding, evidenceRecord, onOpen, onMove, onCopy, readOnly = false }) {
  const [menuOpen, setMenuOpen] = useState(false)
  const {
    attributes, listeners, setNodeRef, transform, transition, isDragging,
  } = useSortable({
    id: finding._id,
    data: { findingId: finding._id, status: finding.status },
    disabled: readOnly,
  })
  const style = { transform: CSS.Transform.toString(transform), transition }
  const progress = { high: 100, medium: 60, low: 30 }[finding.severity] ?? 20
  const typeLabel = findingTypeLabel(finding, evidenceRecord)

  return (
    <article
      aria-label={`${typeLabel}: ${finding.matchedText}`}
      className={`finding-board-card finding-${finding.type} severity-${finding.severity} status-${finding.status} ${finding.type === 'needs_verification' ? 'finding-verification' : ''} ${isDragging ? 'finding-dragging' : ''}`}
      onClick={onOpen}
      onKeyDown={(event) => {
        if (event.target === event.currentTarget && ['Enter', ' '].includes(event.key)) {
          event.preventDefault()
          onOpen()
        }
      }}
      ref={setNodeRef}
      style={style}
      tabIndex={0}
      title={finding.matchedText}
    >
      <div className="finding-card-top">
        <button aria-label={readOnly ? 'Finding drag disabled while review is locked' : 'Drag finding'} className="drag-handle" disabled={readOnly} {...attributes} {...listeners} onClick={(event) => event.stopPropagation()} type="button">
          <GripVertical size={17} />
        </button>
        <Pill tone={finding.type === 'needs_verification' ? 'verification' : finding.type === 'fact_mismatch' ? 'mismatch' : 'rule'}>
          {finding.type === 'needs_verification' ? 'VERIFY' : finding.type === 'fact_mismatch' ? 'MISMATCH' : 'RULE'}
        </Pill>
        {finding.evidence?.refCode && <Pill className="finding-code" tone="neutral">{finding.evidence.refCode}</Pill>}
        <details className="card-menu" onClick={(event) => event.stopPropagation()} onToggle={(event) => setMenuOpen(event.currentTarget.open)}>
          <summary aria-label="Finding actions" className="icon-button"><MoreHorizontal size={18} /></summary>
          {menuOpen && (
            <div className="menu-popover">
              <button onClick={onCopy} type="button">Copy suggestion</button>
              <button onClick={onOpen} type="button">View evidence</button>
              {finding.status !== 'open' && (
                <button disabled={readOnly} onClick={() => onMove(finding, 'open')} type="button">
                  <Undo2 size={13} /> Undo
                </button>
              )}
              {['open', 'accepted', 'dismissed'].map((status) => (
                <button disabled={readOnly} key={status} onClick={() => onMove(finding, status)} type="button">
                  Move to {status[0].toUpperCase() + status.slice(1)}
                </button>
              ))}
            </div>
          )}
        </details>
      </div>
      <h3>{typeLabel}</h3>
      <p className="finding-subtitle">{finding.matchedText}</p>
      <div className="severity-meter-row">
        <span>Severity</span><div aria-label={`${finding.severity} severity`} className="severity-track"><i style={{ width: `${progress}%` }} /></div>
      </div>
      <div className="finding-card-meta">
        {finding.source === 'ai' && <Pill tone="neutral">AI</Pill>}
        {evidenceRecord?.category && <Pill tone="neutral">{evidenceRecord.category}</Pill>}
        {finding.status === 'accepted' && <Pill tone="success"><Check size={12} /> Accepted</Pill>}
        {finding.status === 'dismissed' && <Pill tone="neutral"><Undo2 size={12} /> Dismissed</Pill>}
      </div>
    </article>
  )
}

export default FindingCard
