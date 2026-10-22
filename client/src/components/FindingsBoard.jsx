import { useMemo, useState } from 'react'
import { closestCenter, DndContext, DragOverlay, KeyboardSensor, PointerSensor, useSensor, useSensors } from '@dnd-kit/core'
import { sortableKeyboardCoordinates } from '@dnd-kit/sortable'
import Column from './Column.jsx'
import { findingTypeLabel } from '../utils/findingLabels.js'

const statuses = ['open', 'accepted', 'dismissed']

function FindingsBoard({ findings, evidenceByCode, onOpen, onMove, onCopy, onAdd, statusFilter, query, filter, sort, categoryFilter }) {
  const [activeId, setActiveId] = useState(null)
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  )
  const visible = useMemo(() => findings.filter((finding) => {
    if (statusFilter !== 'all' && finding.status !== statusFilter) return false
    if (query && !`${finding.matchedText} ${finding.suggestion} ${finding.evidence?.refCode}`.toLowerCase().includes(query.toLowerCase())) return false
    if (filter === 'needs_verification' && finding.type !== filter) return false
    if (['high', 'medium', 'low'].includes(filter) && finding.severity !== filter) return false
    if (['rule_violation', 'fact_mismatch'].includes(filter) && finding.type !== filter) return false
    if (categoryFilter !== 'all' && evidenceByCode[finding.evidence?.refCode]?.category !== categoryFilter) return false
    return true
  }), [categoryFilter, evidenceByCode, filter, findings, query, statusFilter])
  const columns = useMemo(() => statuses.map((status) => {
    let items = visible.filter((finding) => finding.status === status)
    if (sort === 'severity') {
      const rank = { high: 0, medium: 1, low: 2 }
      items = [...items].sort((a, b) => rank[a.severity] - rank[b.severity])
    } else if (sort === 'type') {
      items = [...items].sort((a, b) => a.type.localeCompare(b.type))
    } else {
      items = [...items].sort((a, b) => a.startIndex - b.startIndex)
    }
    return { status, items }
  }), [sort, visible])
  const activeFinding = findings.find((finding) => finding._id === activeId)

  function onDragEnd(event) {
    const { active, over } = event
    setActiveId(null)
    if (!over) return
    const current = findings.find((finding) => finding._id === active.id)
    const target = over.data.current?.status ?? String(over.id).replace('status:', '')
    if (current && statuses.includes(target) && target !== current.status) onMove(current, target)
  }

  return (
    <DndContext
      collisionDetection={closestCenter}
      onDragCancel={() => setActiveId(null)}
      onDragEnd={onDragEnd}
      onDragStart={({ active }) => setActiveId(active.id)}
      sensors={sensors}
    >
      <div className="kanban-board">
        {columns.map(({ status, items }) => (
          <Column
            evidenceByCode={evidenceByCode}
            findings={items}
            key={status}
            onAdd={onAdd}
            onCopy={onCopy}
            onMove={onMove}
            onOpen={onOpen}
            status={status}
          />
        ))}
      </div>
      <DragOverlay>
        {activeFinding ? (
          <div className="finding-board-card finding-drag-overlay">
            <span>{findingTypeLabel(activeFinding, evidenceByCode[activeFinding.evidence?.refCode])}</span>
            <p className="finding-subtitle">{activeFinding.matchedText}</p>
          </div>
        ) : null}
      </DragOverlay>
    </DndContext>
  )
}

export default FindingsBoard
