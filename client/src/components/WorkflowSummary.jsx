import WorkflowStatusBadge from './WorkflowStatusBadge.jsx'

function dateLabel(value) {
  if (!value) return 'Not recorded'
  const date = new Date(value)
  return Number.isFinite(date.getTime()) ? date.toLocaleString() : 'Not recorded'
}

function WorkflowSummary({ review, status }) {
  const fields = [
    { label: 'Created by', name: review.createdBy?.name ?? 'Legacy', time: review.createdAt },
    { label: 'Submitted by', name: review.submittedBy?.name ?? 'Not submitted', time: review.submittedAt },
    { label: 'Decided by', name: review.decidedBy?.name ?? 'No decision yet', time: review.decidedAt },
  ]

  return (
    <section aria-label="Workflow summary" className="workflow-summary">
      <div className="workflow-summary-heading"><div><p className="eyebrow">Workflow summary</p><h2>Review record</h2></div><WorkflowStatusBadge status={status} /></div>
      <dl className="workflow-summary-grid">
        {fields.map((field) => (
          <div className="workflow-summary-field" key={field.label}>
            <dt>{field.label}</dt><dd>{field.name}</dd><dd className="workflow-summary-date">{dateLabel(field.time)}</dd>
          </div>
        ))}
        <div className="workflow-summary-field workflow-summary-note">
          <dt>Decision note</dt><dd>{review.decisionNote?.trim() || 'No decision note'}</dd>
        </div>
      </dl>
    </section>
  )
}

export default WorkflowSummary
