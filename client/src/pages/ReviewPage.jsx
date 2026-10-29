import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useLocation, useNavigate, useParams } from 'react-router-dom'
import { BookOpenCheck, ListFilter, Plus, SlidersHorizontal, X } from 'lucide-react'
import { api } from '../api/client.js'
import { copyText } from '../utils/copyText.js'
import Drawer from '../components/Drawer.jsx'
import EmptyState from '../components/EmptyState.jsx'
import FindingDetail from '../components/FindingDetail.jsx'
import FindingsBoard from '../components/FindingsBoard.jsx'
import HighlightedText from '../components/HighlightedText.jsx'
import InputPanel from '../components/InputPanel.jsx'
import LoadingState from '../components/LoadingState.jsx'
import ScoreRing from '../components/ScoreRing.jsx'
import SummaryBar from '../components/SummaryBar.jsx'
import Tabs from '../components/Tabs.jsx'
import WorkflowStatusBadge from '../components/WorkflowStatusBadge.jsx'
import WorkflowDecisionModal from '../components/WorkflowDecisionModal.jsx'
import WorkflowSummary from '../components/WorkflowSummary.jsx'
import AuditTrail from '../components/AuditTrail.jsx'
import { useAuth } from '../context/AuthContext.jsx'

const sampleText =
  'NimbusNotes is the best place to collect ideas, organize projects, and keep important notes close at hand. Built for people who want a simple workspace without sacrificing useful tools, Nimbus Notes brings writing and collaboration together in one calm, searchable home. Our Plus plan is cheap at $8 per user each month. Teams can invite their guys to add notes, share context, and keep work moving. Nimbus Notes has 25 million registered accounts. It supports 42 integrations, so you can connect the tools you already use. More than 30 million active users trust us every day. Our smart workspace makes every team twice as creative. Shared pages help colleagues contribute in one place, while reminders eliminate missed deadlines for every user. Start with a personal notebook, then create shared workspaces as projects grow. You can open your notes on web, iOS, and Android, attach reference files, and search across your workspace when you need a detail again. Nimbus Notes is designed for thoughtful work: capture an idea, turn it into a useful plan, and give your team a clearer place to collaborate.'

const emptySummary = { total: 0, high: 0, medium: 0, low: 0, needsVerification: 0 }
const AUDIT_PAGE_SIZE = 25

function ReviewPage({
  search = '',
  statusFilter = 'all',
  onStatusFilter = () => {},
  newReviewRequest = 0,
  setToast = () => {},
  onSummaryChange = () => {},
}) {
  const { id } = useParams()
  const navigate = useNavigate()
  const location = useLocation()
  const { user } = useAuth()
  const [inputText, setInputText] = useState('')
  const [useAI, setUseAI] = useState(true)
  const [brandName, setBrandName] = useState('Nimbus Notes')
  const [review, setReview] = useState(null)
  const [pageState, setPageState] = useState(id ? 'loading' : 'empty')
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState('')
  const [retryAction, setRetryAction] = useState(null)
  const [filter, setFilter] = useState('all')
  const [sort, setSort] = useState('position')
  const [view, setView] = useState('board')
  const [selectedFindingId, setSelectedFindingId] = useState(null)
  const [updatingFindingId, setUpdatingFindingId] = useState(null)
  const [drawerOpen, setDrawerOpen] = useState(false)
  const [rules, setRules] = useState([])
  const [facts, setFacts] = useState([])
  const [evidenceError, setEvidenceError] = useState('')
  const [slowRequest, setSlowRequest] = useState(false)
  const [inputOpen, setInputOpen] = useState(false)
  const [categoryFilter, setCategoryFilter] = useState('all')
  const [workflowBusy, setWorkflowBusy] = useState(false)
  const [workflowError, setWorkflowError] = useState('')
  const [decisionModal, setDecisionModal] = useState(null)
  const [auditEntries, setAuditEntries] = useState([])
  const [auditPage, setAuditPage] = useState(0)
  const [auditHasMore, setAuditHasMore] = useState(false)
  const [auditLoading, setAuditLoading] = useState(false)
  const [auditLoadingMore, setAuditLoadingMore] = useState(false)
  const [auditError, setAuditError] = useState('')
  const [auditReloadKey, setAuditReloadKey] = useState(0)
  const auditRequestId = useRef(0)
  const slowRequestCount = useRef(0)
  const lastNewRequest = useRef(newReviewRequest)
  const inputModalRef = useRef(null)
  const showSlowMessage = useCallback(() => {
    slowRequestCount.current += 1
    setSlowRequest(true)
  }, [])
  const finishSlowRequest = useCallback(() => {
    slowRequestCount.current = Math.max(0, slowRequestCount.current - 1)
    setSlowRequest(slowRequestCount.current > 0)
  }, [])

  useEffect(() => {
    if (newReviewRequest === lastNewRequest.current) return
    lastNewRequest.current = newReviewRequest
    setDrawerOpen(false)
    if (review) {
      setInputText('')
      setBrandName('Nimbus Notes')
      setInputOpen(true)
    } else {
      setInputOpen(false)
      window.requestAnimationFrame(() => document.getElementById('content')?.focus())
    }
    if (id) navigate('/', { replace: true })
  }, [id, navigate, newReviewRequest, review])

  useEffect(() => {
    if (!location.state?.openNewReview) return
    setInputText('')
    setBrandName('Nimbus Notes')
    setDrawerOpen(false)
    setInputOpen(false)
    navigate('/', { replace: true, state: {} })
    window.requestAnimationFrame(() => document.getElementById('content')?.focus())
  }, [location.state, navigate])

  useEffect(() => {
    if (!inputOpen) return undefined
    const previousFocus = document.activeElement
    const modal = inputModalRef.current
    const focusable = modal?.querySelectorAll('button:not([disabled]), input:not([disabled]), textarea:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex="-1"])')
    focusable?.[0]?.focus()
    function closeOnEscape(event) {
      if (event.key === 'Escape') {
        setInputOpen(false)
      } else if (event.key === 'Tab' && focusable?.length) {
        const first = focusable[0]
        const last = focusable[focusable.length - 1]
        if (event.shiftKey && document.activeElement === first) {
          event.preventDefault()
          last.focus()
        } else if (!event.shiftKey && document.activeElement === last) {
          event.preventDefault()
          first.focus()
        }
      }
    }
    window.addEventListener('keydown', closeOnEscape)
    return () => {
      window.removeEventListener('keydown', closeOnEscape)
      if (previousFocus instanceof HTMLElement) previousFocus.focus()
    }
  }, [inputOpen])

  const loadReview = useCallback(async () => {
    if (!id) return
    setPageState('loading')
    setError('')
    try {
      const savedReview = await api.getReview(id, {
        onSlow: showSlowMessage,
        onSlowComplete: finishSlowRequest,
      })
      setReview(savedReview)
      setInputText(savedReview.inputText)
      setBrandName(savedReview.brandName)
      setFilter('all')
      setSelectedFindingId(null)
      setPageState('results')
    } catch (requestError) {
      setError(requestError.message)
      setRetryAction(() => loadReview)
      setPageState('error')
    }
  }, [finishSlowRequest, id, showSlowMessage])

  useEffect(() => {
    if (id) loadReview()
    else {
      setReview(null)
      setPageState('empty')
      setError('')
      setRetryAction(null)
      setDrawerOpen(false)
    }
  }, [id, loadReview])

  useEffect(() => {
    let active = true
    const options = { onSlow: showSlowMessage, onSlowComplete: finishSlowRequest }
    Promise.all([api.getRules(options), api.getFacts(options)])
      .then(([nextRules, nextFacts]) => {
        if (!active) return
        setRules(nextRules)
        setFacts(nextFacts)
        setEvidenceError('')
      })
      .catch((requestError) => {
        if (active) setEvidenceError(requestError.message)
      })
    return () => { active = false }
  }, [finishSlowRequest, showSlowMessage])

  const evidenceByCode = useMemo(() => {
    const records = {}
    for (const rule of rules) records[rule.code] = rule
    for (const fact of facts) records[fact.code] = fact
    return records
  }, [facts, rules])
  const summary = useMemo(() => {
    if (!review) return emptySummary
    const counts = { ...review.summary, open: 0, accepted: 0, dismissed: 0 }
    for (const finding of review.findings) counts[finding.status] += 1
    return counts
  }, [review])

  useEffect(() => onSummaryChange(summary), [onSummaryChange, summary])

  useEffect(() => {
    if (view !== 'audit' || !review) return undefined
    const requestId = ++auditRequestId.current
    setAuditLoading(true)
    setAuditError('')
    setAuditEntries([])
    setAuditPage(0)
    setAuditHasMore(false)
    setAuditLoadingMore(false)
    api.getReviewAudit(review._id, 1, AUDIT_PAGE_SIZE)
      .then((entries) => {
        if (requestId !== auditRequestId.current) return
        setAuditEntries(entries)
        setAuditPage(1)
        setAuditHasMore(entries.length === AUDIT_PAGE_SIZE)
      })
      .catch((requestError) => {
        if (requestId === auditRequestId.current) setAuditError(requestError.message || 'The audit trail could not be loaded.')
      })
      .finally(() => {
        if (requestId === auditRequestId.current) setAuditLoading(false)
      })
    return () => { auditRequestId.current += 1 }
  }, [auditReloadKey, review?._id, view])

  async function loadMoreAudit() {
    if (!review || auditLoadingMore || !auditHasMore) return
    const requestId = auditRequestId.current
    const nextPage = auditPage + 1
    setAuditLoadingMore(true)
    setAuditError('')
    try {
      const entries = await api.getReviewAudit(review._id, nextPage, AUDIT_PAGE_SIZE)
      if (requestId !== auditRequestId.current) return
      setAuditEntries((current) => [...current, ...entries])
      setAuditPage(nextPage)
      setAuditHasMore(entries.length === AUDIT_PAGE_SIZE)
    } catch (requestError) {
      if (requestId === auditRequestId.current) setAuditError(requestError.message || 'More audit entries could not be loaded.')
    } finally {
      if (requestId === auditRequestId.current) setAuditLoadingMore(false)
    }
  }

  function refreshAudit() {
    setAuditReloadKey((current) => current + 1)
  }

  async function submitReview() {
    if (!review) setPageState('loading')
    setSubmitting(true)
    setError('')
    setRetryAction(() => submitReview)
    try {
      const result = await api.createReview(inputText, brandName.trim() || 'Nimbus Notes', useAI, {
        onSlow: showSlowMessage,
        onSlowComplete: finishSlowRequest,
      })
      const savedReview = await api.getReview(result._id)
      setReview(savedReview)
      refreshAudit()
      setBrandName(savedReview.brandName)
      setFilter('all')
      setSelectedFindingId(null)
      setPageState('results')
      setInputOpen(false)
      onStatusFilter('all')
      if (id) navigate('/', { replace: true })
    } catch (requestError) {
      setError(requestError.message)
      if (!review) setPageState('error')
    } finally {
      setSubmitting(false)
    }
  }

  async function updateFindingStatus(finding, status) {
    if (!review || finding.status === status || updatingFindingId) return
    const previousReview = review
    const optimisticReview = {
      ...review,
      findings: review.findings.map((item) => item._id === finding._id ? { ...item, status } : item),
    }
    setReview(optimisticReview)
    setUpdatingFindingId(finding._id)
    setError('')
    try {
      await api.updateFinding(
        review._id,
        finding._id,
        status,
        { onSlow: showSlowMessage, onSlowComplete: finishSlowRequest },
      )
      const updatedReview = await api.getReview(review._id)
      setReview(updatedReview)
      refreshAudit()
      setToast(`Finding moved to ${status}`)
    } catch (requestError) {
      if (requestError.status === 409) {
        try { setReview(await api.getReview(review._id)) } catch { setReview(previousReview) }
        refreshAudit()
        const message = 'Locked while pending approval. The latest review status has been loaded.'
        setError(message)
        setToast(message)
      } else {
        setReview(previousReview)
        setError(requestError.message)
        setToast(`Could not update finding: ${requestError.message}`)
      }
    } finally {
      setUpdatingFindingId(null)
      setSlowRequest(slowRequestCount.current > 0)
    }
  }

  function openFinding(finding) {
    setSelectedFindingId(finding._id)
    setDrawerOpen(true)
  }

  function viewFindingInText() {
    setView('text')
    setDrawerOpen(false)
    window.requestAnimationFrame(() => {
      document.getElementById(`highlight-${selectedFindingId}`)?.scrollIntoView({
        behavior: 'smooth',
        block: 'center',
      })
    })
  }

  async function copySuggestion(finding) {
    try {
      setToast(await copyText(finding.suggestion ?? '') ? 'Suggestion copied' : 'Could not copy suggestion')
    } catch {
      setToast('Could not copy suggestion')
    }
  }

  async function addFindingComment(findingId, text) {
    const comment = await api.addFindingComment(review._id, findingId, text)
    const optimisticReview = {
      ...review,
      findings: review.findings.map((finding) => finding._id === findingId
        ? { ...finding, comments: [...(finding.comments ?? []), comment] }
        : finding),
    }
    setReview(optimisticReview)
    refreshAudit()
    try {
      setReview(await api.getReview(review._id))
    } catch {
      setToast('Comment posted. The latest review could not be refreshed.')
    }
  }

  function clearInput() {
    setInputText('')
    setReview(null)
    setError('')
    setPageState('empty')
    setFilter('all')
    setInputOpen(false)
    if (id) navigate('/', { replace: true })
  }

  async function runWorkflowAction(action, note) {
    if (!review || workflowBusy) return
    setWorkflowBusy(true)
    setWorkflowError('')
    try {
      if (action === 'submit') await api.submitReview(review._id)
      else if (action === 'approve') await api.approveReview(review._id, note)
      else await api.requestChanges(review._id, note)
      setReview(await api.getReview(review._id))
      refreshAudit()
      setDecisionModal(null)
      setToast(action === 'submit' ? 'Review submitted for approval' : action === 'approve' ? 'Review approved' : 'Changes requested')
    } catch (actionError) {
      setWorkflowError(actionError.message || 'The workflow action could not be completed. Please try again.')
      if (actionError.status === 409) {
        try { setReview(await api.getReview(review._id)) } catch { /* keep the current view if refresh also fails */ }
        refreshAudit()
      }
    } finally {
      setWorkflowBusy(false)
    }
  }

  function openDecisionModal(decision) {
    setWorkflowError('')
    setDecisionModal(decision)
  }

  const visibleFindings = useMemo(() => (review?.findings ?? []).filter((finding) => {
    if (statusFilter !== 'all' && finding.status !== statusFilter) return false
    if (search && !`${finding.matchedText} ${finding.suggestion} ${finding.evidence?.refCode}`.toLowerCase().includes(search.toLowerCase())) return false
    if (filter === 'needs_verification' && finding.type !== filter) return false
    if (['high', 'medium', 'low'].includes(filter) && finding.severity !== filter) return false
    if (['rule_violation', 'fact_mismatch'].includes(filter) && finding.type !== filter) return false
    const category = evidenceByCode[finding.evidence?.refCode]?.category
    if (categoryFilter !== 'all' && category !== categoryFilter) return false
    return true
  }), [categoryFilter, evidenceByCode, filter, review, search, statusFilter])
  const selectedFinding = review?.findings.find((finding) => finding._id === selectedFindingId)
  const categories = [...new Set([...rules, ...facts].map((item) => item.category).filter(Boolean))]
  const workflowStatus = review?.workflowStatus ?? 'draft'
  const workflowLocked = ['pending_approval', 'approved'].includes(workflowStatus)
  const openHighFindings = review?.findings.filter((finding) => finding.severity === 'high' && finding.status === 'open').length ?? 0

  return (
    <div className="review-page">
      <div className="review-heading">
        <div>
          <p className="eyebrow">{review ? `REVIEW / ${new Date().toLocaleDateString('en-GB').replaceAll('/', '.')}` : 'REVIEW'}</p>
          <h1>{review ? `${review.brandName} launch copy` : 'Review copy'}</h1>
          <p className="page-description">
            {review ? 'Findings and evidence' : 'Check copy against approved rules and facts.'}
          </p>
          {review && <div className="review-owner-line"><WorkflowStatusBadge status={workflowStatus} /><span>Created by {review.createdBy?.name ?? 'Legacy'}</span></div>}
        </div>
        {review && <div className="review-meta"><BookOpenCheck size={16} /> {review.findings.length} findings <span>·</span> Updated {new Date(review.updatedAt ?? review.createdAt).toLocaleDateString()}</div>}
      </div>

      {review && (
        <WorkflowSummary review={review} status={workflowStatus} />
      )}

      {review && (
        <section aria-label="Approval workflow" className="workflow-panel">
          <div className="workflow-panel-copy">
            <p className="eyebrow">Approval workflow</p>
            {workflowStatus === 'draft' || workflowStatus === 'changes_requested' ? (
              <>
                <h2>{workflowStatus === 'draft' ? 'Ready for review?' : 'Ready to resubmit?'}</h2>
                <p>{openHighFindings ? `Resolve ${openHighFindings} high-severity ${openHighFindings === 1 ? 'finding' : 'findings'} first.` : 'Submit this review to an approver when the findings are ready.'}</p>
              </>
            ) : workflowStatus === 'pending_approval' ? (
              <><h2>Pending approval</h2><p>{user.role === 'approver' ? `Submitted by ${review.submittedBy?.name ?? 'a reviewer'}${review.submittedAt ? ` on ${new Date(review.submittedAt).toLocaleString()}` : ''}.` : 'Waiting for an approver.'}</p></>
            ) : (
              <><h2>Approved</h2><p>Approved by {review.decidedBy?.name ?? 'an approver'}{review.decidedAt ? ` on ${new Date(review.decidedAt).toLocaleString()}` : ''}.</p></>
            )}
            {['approved', 'changes_requested'].includes(workflowStatus) && review.decisionNote && <p className="decision-summary"><strong>Decision note:</strong> {review.decisionNote}</p>}
            {workflowStatus === 'changes_requested' && <p className="decision-summary">Changes requested by {review.decidedBy?.name ?? 'an approver'}{review.decidedAt ? ` on ${new Date(review.decidedAt).toLocaleString()}` : ''}.</p>}
          </div>
          <div className="workflow-panel-actions">
            {(workflowStatus === 'draft' || workflowStatus === 'changes_requested') && (
              <>
                <button className="button-primary" disabled={workflowBusy || openHighFindings > 0} onClick={() => runWorkflowAction('submit')} title={openHighFindings > 0 ? `Resolve ${openHighFindings} high-severity findings first` : undefined} type="button">
                  {workflowBusy ? 'Submitting…' : 'Submit for approval'}
                </button>
                {openHighFindings > 0 && <span className="workflow-helper">Resolve {openHighFindings} high-severity {openHighFindings === 1 ? 'finding' : 'findings'} first</span>}
              </>
            )}
            {workflowStatus === 'pending_approval' && user.role === 'approver' && <>
              <button className="button-success" disabled={workflowBusy} onClick={() => openDecisionModal('approve')} type="button">Approve</button>
              <button className="button-secondary" disabled={workflowBusy} onClick={() => openDecisionModal('request-changes')} type="button">Request changes</button>
            </>}
            {workflowStatus === 'pending_approval' && user.role === 'reviewer' && <span className="waiting-approver">Waiting for an approver</span>}
          </div>
          {workflowError && <p className="workflow-error" role="alert">{workflowError}</p>}
        </section>
      )}

      {review && (
        <section aria-label="Review summary" className="review-overview">
          <div className="review-stat-grid">
            <div className="review-stat mismatch"><strong>{review.findings.filter((finding) => finding.type === 'fact_mismatch').length}</strong><span>MISMATCH</span></div>
            <div className="review-stat rule"><strong>{review.findings.filter((finding) => finding.type === 'rule_violation').length}</strong><span>RULE</span></div>
            <div className="review-stat verify"><strong>{review.findings.filter((finding) => finding.type === 'needs_verification').length}</strong><span>VERIFY</span></div>
          </div>
          <div className="compliance-stat">
            <ScoreRing findings={review.findings} />
            <span>COMPLIANCE / 100</span>
          </div>
        </section>
      )}

      {slowRequest && <div className="waking-message" role="status" aria-live="polite">This is taking longer than usual. The server may be starting up or still processing your request.</div>}
      {error && !inputOpen && (
        <div className="inline-error" role="alert">
          <div><strong>Something went wrong</strong><p>{error}</p></div>
          {retryAction && <button className="button-secondary" onClick={retryAction} type="button">Retry</button>}
        </div>
      )}
      {evidenceError && <p className="inline-warning" role="status">Evidence details could not be loaded: {evidenceError}</p>}
      {review?.aiStatus === 'unavailable' && (
        <p className="inline-warning" role="status">AI unavailable, showing rule-based results only.</p>
      )}

      {pageState === 'loading' && id && <LoadingState label={slowRequest ? 'Still loading; the server may be starting up or processing your request.' : 'Loading saved review…'} />}
      {!review && !id && (
        <div className="empty-review-layout">
          <EmptyState />
          <InputPanel
            brandName={brandName}
            inputText={inputText}
            loading={submitting}
            onBrandNameChange={setBrandName}
            onClear={clearInput}
            onLoadSample={() => setInputText(sampleText)}
            onReview={submitReview}
            onTextChange={setInputText}
            useAI={useAI}
            onUseAIChange={setUseAI}
          />
        </div>
      )}

      {review && pageState === 'results' && (
        <>
          <div className="view-toolbar">
            <Tabs active={view} items={[{ value: 'board', label: 'Board view' }, { value: 'text', label: 'Text view' }, { value: 'audit', label: 'Audit trail' }]} onChange={setView} />
            {view !== 'audit' && <div className="toolbar-controls">
              <label className="select-control"><ListFilter size={15} /><span>Filter</span>
                <select aria-label="Filter findings" onChange={(event) => setFilter(event.target.value)} value={filter}>
                  <option value="all">All findings</option><option value="high">High severity</option><option value="medium">Medium severity</option><option value="low">Low severity</option>
                  <option value="needs_verification">Needs verification</option><option value="rule_violation">Brand rules</option><option value="fact_mismatch">Fact mismatch</option>
                </select>
              </label>
              <label className="select-control"><SlidersHorizontal size={15} /><span>Sort</span>
                <select aria-label="Sort findings" onChange={(event) => setSort(event.target.value)} value={sort}>
                  <option value="position">Text position</option><option value="severity">Severity</option><option value="type">Type</option>
                </select>
              </label>
              <label className="select-control category-select"><span>Category</span>
                <select aria-label="Filter category" onChange={(event) => setCategoryFilter(event.target.value)} value={categoryFilter}>
                  <option value="all">All categories</option>{categories.map((category) => <option key={category} value={category}>{category}</option>)}
                </select>
              </label>
            </div>}
          </div>

          {workflowLocked && view !== 'audit' && <p className="locked-explanation" role="status">Locked while pending approval. Finding status changes and board drag-and-drop are disabled.</p>}

          {view === 'audit' ? (
            <AuditTrail
              entries={auditEntries}
              error={auditError}
              hasMore={auditHasMore}
              loading={auditLoading}
              loadingMore={auditLoadingMore}
              onLoadMore={loadMoreAudit}
              onRefresh={refreshAudit}
              onRetry={refreshAudit}
            />
          ) : view === 'board' ? (
            <FindingsBoard
              evidenceByCode={evidenceByCode}
              findings={review.findings}
              onAdd={() => setInputOpen(true)}
              onCopy={copySuggestion}
              onMove={updateFindingStatus}
              onOpen={openFinding}
              query={search}
              filter={filter}
              sort={sort}
              statusFilter={statusFilter}
              categoryFilter={categoryFilter}
              readOnly={workflowLocked}
            />
          ) : (
            <div className="text-view-layout">
              <div className="text-view-main">
                <SummaryBar filter={filter} onFilterChange={setFilter} summary={summary} />
                <HighlightedText
                  evidenceByCode={evidenceByCode}
                  findings={visibleFindings}
                  onSelect={(findingId) => openFinding(review.findings.find((item) => item._id === findingId))}
                  selectedFindingId={selectedFindingId}
                  text={review.inputText}
                />
              </div>
            </div>
          )}
        </>
      )}

      <Drawer open={drawerOpen && Boolean(selectedFinding)} onClose={() => setDrawerOpen(false)} title="Finding details">
        {selectedFinding && (
          <FindingDetail
            evidenceRecord={evidenceByCode[selectedFinding.evidence?.refCode]}
            finding={selectedFinding}
            onStatusChange={updateFindingStatus}
            onAddComment={addFindingComment}
            readOnly={workflowLocked}
            onToast={setToast}
            onViewText={viewFindingInText}
            review={review}
            updating={updatingFindingId === selectedFinding._id}
            key={selectedFinding._id}
          />
        )}
      </Drawer>

      {inputOpen && (
        <div className="modal-backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget) setInputOpen(false) }}>
          <section aria-labelledby="new-review-title" aria-modal="true" className="new-review-modal" ref={inputModalRef} role="dialog">
            <div className="modal-header"><div><p className="eyebrow">New analysis</p><h2 id="new-review-title">Start a new review</h2></div><button aria-label="Close new review dialog" className="icon-button" onClick={() => setInputOpen(false)} type="button"><X size={18} /></button></div>
            <InputPanel brandName={brandName} inputText={inputText} loading={submitting} onBrandNameChange={setBrandName} onClear={clearInput} onLoadSample={() => setInputText(sampleText)} onReview={submitReview} onTextChange={setInputText} useAI={useAI} onUseAIChange={setUseAI} />
            {pageState === 'error' && <p className="inline-warning">{error}</p>}
            <button className="modal-close-link" onClick={() => setInputOpen(false)} type="button"><Plus size={14} /> Keep editing later</button>
          </section>
        </div>
      )}

      {decisionModal && <WorkflowDecisionModal
        busy={workflowBusy}
        decision={decisionModal}
        error={workflowError}
        onClose={() => { if (!workflowBusy) { setDecisionModal(null); setWorkflowError('') } }}
        onConfirm={(note) => runWorkflowAction(decisionModal, note)}
      />}
    </div>
  )
}

export default ReviewPage
