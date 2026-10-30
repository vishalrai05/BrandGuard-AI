import { useCallback, useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { ArrowUpRight, Clock3, FileText, Search } from 'lucide-react'
import { api } from '../api/client.js'
import Pill from '../components/Pill.jsx'
import WorkflowStatusBadge from '../components/WorkflowStatusBadge.jsx'
import { downloadText, safeReportFilename, summaryCsv } from '../utils/reportExport.js'

const MAX_REPORT_SELECTION = 25

function HistoryPage() {
  const [reviews, setReviews] = useState([])
  const [state, setState] = useState('loading')
  const [error, setError] = useState('')
  const [slowRequest, setSlowRequest] = useState(false)
  const [query, setQuery] = useState('')
  const [workflowFilter, setWorkflowFilter] = useState('all')
  const [selectedIds, setSelectedIds] = useState([])
  const [exporting, setExporting] = useState(false)
  const [exportError, setExportError] = useState('')

  const loadReviews = useCallback(async () => {
    setState('loading')
    setError('')
    try {
      const result = await api.getReviews({
        onSlow: () => setSlowRequest(true),
        onSlowComplete: () => setSlowRequest(false),
      })
      setReviews(result)
      setState('success')
    } catch (requestError) {
      setError(requestError.message)
      setState('error')
    }
  }, [])

  useEffect(() => { loadReviews() }, [loadReviews])
  const filtered = reviews.filter((review) =>
    review.brandName.toLowerCase().includes(query.toLowerCase())
    && (workflowFilter === 'all' || (review.workflowStatus ?? 'draft') === workflowFilter))

  function toggleSelected(id, checked) {
    setSelectedIds((current) => checked ? [...current, id].slice(0, MAX_REPORT_SELECTION) : current.filter((item) => item !== id))
  }

  async function exportSummary() {
    if (!selectedIds.length || exporting) return
    setExporting(true)
    setExportError('')
    try {
      const result = await api.getReportSummary(selectedIds)
      if (result.rows.length) downloadText(summaryCsv(result.rows), safeReportFilename('history-summary', new Date(), 'csv'), 'text/csv;charset=utf-8')
      setExportError(result.missing.length ? `${result.missing.length} review${result.missing.length === 1 ? '' : 's'} no longer exist and were skipped.` : '')
    } catch (requestError) { setExportError(requestError.message || 'The summary could not be exported.') }
    finally { setExporting(false) }
  }

  return (
    <section>
      <div className="page-heading-row">
        <div><p className="eyebrow">Reviews</p><h1>History</h1><p>Past reviews and their findings.</p></div>
        <div className="history-filters">
          <label className="library-search"><Search size={15} /><input aria-label="Search review history" onChange={(event) => setQuery(event.target.value)} placeholder="Search by brand..." value={query} /></label>
          <label className="select-control history-status-filter"><span>Status</span>
            <select aria-label="Filter by workflow status" onChange={(event) => setWorkflowFilter(event.target.value)} value={workflowFilter}>
              <option value="all">All</option><option value="draft">Draft</option><option value="pending_approval">Pending</option><option value="approved">Approved</option><option value="changes_requested">Changes requested</option>
            </select>
          </label>
        </div>
      </div>
      {slowRequest && <p className="waking-message" role="status">Waking up the server, this can take up to a minute</p>}
      {state === 'loading' && <div className="loading-state" role="status"><span className="loading-spinner" /><span className="skeleton" /><p>Loading review history...</p></div>}
      {state === 'error' && <div className="inline-error" role="alert"><div><strong>History could not be loaded</strong><p>{error}</p></div><button className="button-secondary" onClick={loadReviews} type="button">Retry</button></div>}
      {state === 'success' && reviews.length > 0 && <div className="history-export-bar"><div><strong>{selectedIds.length} selected</strong><p>Select up to 25 reviews for a compact summary CSV.</p></div><button className="button-primary" disabled={!selectedIds.length || exporting} onClick={exportSummary} type="button">{exporting ? 'Preparing CSV…' : 'Export summary (CSV)'}</button></div>}
      {exportError && <p className="inline-warning" role="status">{exportError}</p>}
      {state === 'success' && reviews.length === 0 && <div className="friendly-empty"><strong>No reviews yet</strong><p>Run a review to see it listed here.</p><Link className="button-primary" to="/">Start a review</Link></div>}
      {state === 'success' && reviews.length > 0 && filtered.length === 0 && <div className="friendly-empty"><strong>No matching reviews</strong><p>Try a different brand name.</p></div>}
      {state === 'success' && filtered.length > 0 && (
        <div className="history-grid">
          {filtered.map((review) => (
            <article className="history-card" key={review._id}>
              <div className="history-card-top"><Link className="history-card-link" to={`/reviews/${review._id}`}><div><h2>{review.brandName}</h2><time dateTime={review.createdAt}><Clock3 size={12} /> {new Date(review.createdAt).toLocaleString()}</time></div><div className="history-card-status"><WorkflowStatusBadge status={review.workflowStatus ?? 'draft'} /><ArrowUpRight aria-hidden="true" color="var(--muted)" size={16} /></div></Link><label className="history-select"><input aria-label={`Select ${review.brandName} review for export`} checked={selectedIds.includes(review._id)} disabled={!selectedIds.includes(review._id) && selectedIds.length >= MAX_REPORT_SELECTION} onChange={(event) => toggleSelected(review._id, event.target.checked)} type="checkbox" /><span>Select for export</span></label></div>
              <p className="history-creator">Created by {review.createdBy?.name ?? 'Legacy'}</p>
              {review.source?.kind === 'document' && <p className="history-source"><FileText aria-hidden="true" size={13} /> {review.source.filename}</p>}
              <div className="history-summary">
                <Pill className="history-total" tone="neutral">{review.summary.total} findings</Pill>
                {review.summary.high > 0 && <Pill tone="high">{review.summary.high} high</Pill>}
                {review.summary.medium > 0 && <Pill tone="medium">{review.summary.medium} medium</Pill>}
                {review.summary.low > 0 && <Pill tone="low">{review.summary.low} low</Pill>}
                {review.summary.needsVerification > 0 && <Pill tone="verification">{review.summary.needsVerification} verify</Pill>}
              </div>
            </article>
          ))}
        </div>
      )}
    </section>
  )
}

export default HistoryPage
