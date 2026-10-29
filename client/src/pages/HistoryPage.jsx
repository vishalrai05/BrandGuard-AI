import { useCallback, useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { ArrowUpRight, Clock3, Search } from 'lucide-react'
import { api } from '../api/client.js'
import Pill from '../components/Pill.jsx'
import WorkflowStatusBadge from '../components/WorkflowStatusBadge.jsx'

function HistoryPage() {
  const [reviews, setReviews] = useState([])
  const [state, setState] = useState('loading')
  const [error, setError] = useState('')
  const [slowRequest, setSlowRequest] = useState(false)
  const [query, setQuery] = useState('')
  const [workflowFilter, setWorkflowFilter] = useState('all')

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
      {state === 'success' && reviews.length === 0 && <div className="friendly-empty"><strong>No reviews yet</strong><p>Run a review to see it listed here.</p><Link className="button-primary" to="/">Start a review</Link></div>}
      {state === 'success' && reviews.length > 0 && filtered.length === 0 && <div className="friendly-empty"><strong>No matching reviews</strong><p>Try a different brand name.</p></div>}
      {state === 'success' && filtered.length > 0 && (
        <div className="history-grid">
          {filtered.map((review) => (
            <Link className="history-card" key={review._id} to={`/reviews/${review._id}`}>
              <div className="history-card-top"><div><h2>{review.brandName}</h2><time dateTime={review.createdAt}><Clock3 size={12} /> {new Date(review.createdAt).toLocaleString()}</time></div><div className="history-card-status"><WorkflowStatusBadge status={review.workflowStatus ?? 'draft'} /><ArrowUpRight aria-hidden="true" color="var(--muted)" size={16} /></div></div>
              <p className="history-creator">Created by {review.createdBy?.name ?? 'Legacy'}</p>
              <div className="history-summary">
                <Pill className="history-total" tone="neutral">{review.summary.total} findings</Pill>
                {review.summary.high > 0 && <Pill tone="high">{review.summary.high} high</Pill>}
                {review.summary.medium > 0 && <Pill tone="medium">{review.summary.medium} medium</Pill>}
                {review.summary.low > 0 && <Pill tone="low">{review.summary.low} low</Pill>}
                {review.summary.needsVerification > 0 && <Pill tone="verification">{review.summary.needsVerification} verify</Pill>}
              </div>
            </Link>
          ))}
        </div>
      )}
    </section>
  )
}

export default HistoryPage
