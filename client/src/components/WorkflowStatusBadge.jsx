const labels = {
  draft: 'Draft',
  pending_approval: 'Pending approval',
  approved: 'Approved',
  changes_requested: 'Changes requested',
}

function WorkflowStatusBadge({ status = 'draft' }) {
  const safeStatus = labels[status] ? status : 'draft'
  return <span className={`workflow-badge workflow-${safeStatus}`}>{labels[safeStatus]}</span>
}

export default WorkflowStatusBadge
