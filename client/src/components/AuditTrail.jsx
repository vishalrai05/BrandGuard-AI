import { useMemo, useState } from 'react'
import { ArrowRightLeft, CheckCheck, CirclePlus, ClipboardList, FileDown, LoaderCircle, MessageSquare, Send, Undo2 } from 'lucide-react'
import { copyText } from '../utils/copyText.js'

const ACTIONS = [
  'review_created',
  'finding_status_changed',
  'review_submitted',
  'review_approved',
  'changes_requested',
  'comment_added',
  'report_exported',
]

const actionDetails = {
  review_created: { label: 'Review created', icon: CirclePlus },
  finding_status_changed: { label: 'Finding status changed', icon: ArrowRightLeft },
  review_submitted: { label: 'Review submitted', icon: Send },
  review_approved: { label: 'Review approved', icon: CheckCheck },
  changes_requested: { label: 'Changes requested', icon: Undo2 },
  comment_added: { label: 'Comment added', icon: MessageSquare },
  report_exported: { label: 'Compliance report exported', icon: FileDown },
}

function statusName(status = '') {
  return status.replaceAll('_', ' ').replace(/\b\w/g, (letter) => letter.toUpperCase())
}

function sentenceFor(entry) {
  const actor = `${entry.actorName || 'A user'} (${entry.actorRole || 'user'})`
  switch (entry.action) {
    case 'review_created': return `${actor} created the review.`
    case 'finding_status_changed': return `${actor} changed a finding from ${statusName(entry.from)} to ${statusName(entry.to)}.`
    case 'review_submitted': return `${actor} submitted the review for approval.`
    case 'review_approved': return `${actor} approved the review.`
    case 'changes_requested': return `${actor} requested changes.`
    case 'comment_added': return `${actor} commented on a finding.`
    case 'report_exported': return `${actor} exported a compliance report.`
    default: return `${actor} updated the review.`
  }
}

function auditText(entry) {
  const time = entry.createdAt ? new Date(entry.createdAt).toLocaleString() : 'Time unavailable'
  return [
    `${time} — ${sentenceFor(entry)}`,
    entry.matchedText ? `Matched text: “${entry.matchedText}”` : '',
    entry.note ? `Note: ${entry.note}` : '',
  ].filter(Boolean).join('\n')
}

function AuditTrail({ entries, loading, loadingMore, error, hasMore, onLoadMore, onRetry, onRefresh }) {
  const [filter, setFilter] = useState('all')
  const [copyMessage, setCopyMessage] = useState('')
  const filteredEntries = useMemo(() => entries.filter((entry) => filter === 'all' || entry.action === filter), [entries, filter])

  async function copyTimeline() {
    const content = filteredEntries.map(auditText).join('\n\n')
    if (!content) {
      setCopyMessage('There is no timeline content to copy.')
      return
    }
    try {
      const copied = await copyText(content)
      setCopyMessage(copied ? 'Audit trail copied.' : 'Could not copy the audit trail.')
    } catch {
      setCopyMessage('Could not copy the audit trail.')
    }
  }

  return (
    <section aria-labelledby="audit-trail-heading" className="audit-view">
      <div className="audit-toolbar">
        <div><p className="eyebrow">Review activity</p><h2 id="audit-trail-heading">Audit trail</h2></div>
        <div className="audit-actions">
          <label className="select-control audit-filter"><span>Action</span>
            <select aria-label="Filter audit trail by action" onChange={(event) => setFilter(event.target.value)} value={filter}>
              <option value="all">All actions</option>
              {ACTIONS.map((action) => <option key={action} value={action}>{actionDetails[action].label}</option>)}
            </select>
          </label>
          <button className="button-secondary button-small" disabled={!entries.length} onClick={copyTimeline} type="button">Copy as text</button>
          <button aria-label="Refresh audit trail" className="icon-button" disabled={loading} onClick={onRefresh} title="Refresh audit trail" type="button"><ClipboardList size={16} /></button>
        </div>
      </div>
      {copyMessage && <p aria-live="polite" className="audit-copy-status">{copyMessage}</p>}
      {error && <div className="inline-error" role="alert"><div><strong>Audit trail could not be loaded</strong><p>{error}</p></div><button className="button-secondary" onClick={onRetry} type="button">Retry</button></div>}
      {loading && entries.length === 0 && <div className="loading-state" role="status"><LoaderCircle className="animate-spin" size={22} /><p>Loading audit trail…</p></div>}
      {!loading && !error && entries.length === 0 && <div className="friendly-empty"><strong>No audit entries yet</strong><p>Review creation and workflow actions will appear here.</p></div>}
      {!loading && !error && entries.length > 0 && filteredEntries.length === 0 && <div className="friendly-empty"><strong>No matching entries in the loaded timeline</strong><p>{hasMore ? 'Load more entries or choose another action type.' : 'Choose another action type to see its entries.'}</p></div>}
      {filteredEntries.length > 0 && (
        <ol aria-label="Review audit events, oldest first" className="audit-timeline">
          {filteredEntries.map((entry, index) => {
            const details = actionDetails[entry.action] ?? { label: 'Review updated', icon: ClipboardList }
            const Icon = details.icon
            const createdAt = entry.createdAt ? new Date(entry.createdAt) : null
            const validTime = createdAt && Number.isFinite(createdAt.getTime())
            return (
              <li className="audit-entry" key={entry._id ?? `${entry.action}-${entry.createdAt}-${index}`}>
                <span aria-hidden="true" className={`audit-icon audit-${entry.action}`}><Icon size={15} /></span>
                <article className="audit-entry-card">
                  <p className="audit-sentence">{sentenceFor(entry)}</p>
                  <span className="audit-action-label">{details.label}</span>
                  {entry.matchedText && <blockquote className="audit-matched-text">{entry.matchedText}</blockquote>}
                  {entry.note && <p className="audit-note"><strong>Note</strong>{entry.note}</p>}
                  {validTime && <time dateTime={createdAt.toISOString()}>{createdAt.toLocaleString()}</time>}
                </article>
              </li>
            )
          })}
        </ol>
      )}
      {loadingMore && <p className="audit-loading-more" role="status"><LoaderCircle className="animate-spin" size={15} /> Loading more activity…</p>}
      {hasMore && !error && <button className="button-secondary audit-load-more" disabled={loadingMore} onClick={onLoadMore} type="button">{loadingMore ? 'Loading…' : 'Load more'}</button>}
    </section>
  )
}

export default AuditTrail
