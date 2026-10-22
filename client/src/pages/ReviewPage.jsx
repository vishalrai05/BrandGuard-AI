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

const sampleText =
  'NimbusNotes is the best place to collect ideas, organize projects, and keep important notes close at hand. Built for people who want a simple workspace without sacrificing useful tools, Nimbus Notes brings writing and collaboration together in one calm, searchable home. Our Plus plan is cheap at $8 per user each month. Teams can invite their guys to add notes, share context, and keep work moving. Nimbus Notes has 25 million registered accounts. It supports 42 integrations, so you can connect the tools you already use. More than 30 million active users trust us every day. Our smart workspace makes every team twice as creative. Shared pages help colleagues contribute in one place, while reminders eliminate missed deadlines for every user. Start with a personal notebook, then create shared workspaces as projects grow. You can open your notes on web, iOS, and Android, attach reference files, and search across your workspace when you need a detail again. Nimbus Notes is designed for thoughtful work: capture an idea, turn it into a useful plan, and give your team a clearer place to collaborate.'

const emptySummary = { total: 0, high: 0, medium: 0, low: 0, needsVerification: 0 }

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
  const [inputText, setInputText] = useState('')
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

  async function submitReview() {
    if (!review) setPageState('loading')
    setSubmitting(true)
    setError('')
    setRetryAction(() => submitReview)
    try {
      const result = await api.createReview(inputText, brandName.trim() || 'Nimbus Notes', {
        onSlow: showSlowMessage,
        onSlowComplete: finishSlowRequest,
      })
      setReview(result)
      setBrandName(result.brandName)
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
      const updatedReview = await api.updateFinding(
        review._id,
        finding._id,
        status,
        { onSlow: showSlowMessage, onSlowComplete: finishSlowRequest },
      )
      setReview(updatedReview)
      setToast(`Finding moved to ${status}`)
    } catch (requestError) {
      setReview(previousReview)
      setError(requestError.message)
      setToast(`Could not update finding: ${requestError.message}`)
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

  function clearInput() {
    setInputText('')
    setReview(null)
    setError('')
    setPageState('empty')
    setFilter('all')
    setInputOpen(false)
    if (id) navigate('/', { replace: true })
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

  return (
    <div className="review-page">
      <div className="review-heading">
        <div>
          <p className="eyebrow">Brand governance workspace</p>
          <h1>{review ? review.brandName : 'Keep every message on-brand'}</h1>
          <p className="page-description">
            {review ? 'Review findings, collaborate on fixes, and track decisions.' : 'Review copy against your approved rules and facts before it reaches customers.'}
          </p>
        </div>
        {review && <div className="review-meta"><BookOpenCheck size={16} /> {review.findings.length} findings <span>·</span> Updated {new Date(review.updatedAt ?? review.createdAt).toLocaleDateString()}</div>}
      </div>

      {slowRequest && <div className="waking-message" role="status" aria-live="polite">Waking up the server, this can take up to a minute</div>}
      {error && !inputOpen && (
        <div className="inline-error" role="alert">
          <div><strong>Something went wrong</strong><p>{error}</p></div>
          {retryAction && <button className="button-secondary" onClick={retryAction} type="button">Retry</button>}
        </div>
      )}
      {evidenceError && <p className="inline-warning" role="status">Evidence details could not be loaded: {evidenceError}</p>}

      {pageState === 'loading' && id && <LoadingState label={slowRequest ? 'Waking up the server, this can take up to a minute' : 'Loading saved review…'} />}
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
          />
        </div>
      )}

      {review && pageState === 'results' && (
        <>
          <div className="view-toolbar">
            <Tabs active={view} items={[{ value: 'board', label: 'Board view' }, { value: 'text', label: 'Text view' }]} onChange={setView} />
            <div className="toolbar-controls">
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
            </div>
          </div>

          {view === 'board' ? (
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
              <aside className="score-panel">
                <ScoreRing findings={review.findings} />
                <h2>Compliance score</h2>
                <p>A directional score from severity-weighted review findings.</p>
              </aside>
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
            <InputPanel brandName={brandName} inputText={inputText} loading={submitting} onBrandNameChange={setBrandName} onClear={clearInput} onLoadSample={() => setInputText(sampleText)} onReview={submitReview} onTextChange={setInputText} />
            {pageState === 'error' && <p className="inline-warning">{error}</p>}
            <button className="modal-close-link" onClick={() => setInputOpen(false)} type="button"><Plus size={14} /> Keep editing later</button>
          </section>
        </div>
      )}
    </div>
  )
}

export default ReviewPage
