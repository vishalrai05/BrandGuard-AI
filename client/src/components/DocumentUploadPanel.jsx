import { useRef, useState } from 'react'
import { FileText, FolderUp, LoaderCircle, RotateCcw, X } from 'lucide-react'
import { api } from '../api/client.js'
import { downloadText, safeReportFilename, summaryCsv } from '../utils/reportExport.js'

const MAX_FILES = 5
const MAX_FILE_BYTES = 5 * 1024 * 1024
const ACCEPTED = /\.(pdf|docx)$/i

function DocumentUploadPanel({ brandId, brandName, setBrandName, hideBrandName = false, useAI, onUseAIChange, qualityChecks, onQualityChecksChange, disabled = false, onOpenReview }) {
  const [rows, setRows] = useState([])
  const [busy, setBusy] = useState(false)
  const [cancelRemaining, setCancelRemaining] = useState(false)
  const [error, setError] = useState('')
  const [exportError, setExportError] = useState('')
  const [exportingSummary, setExportingSummary] = useState(false)
  const [slow, setSlow] = useState(false)
  const inputRef = useRef(null)
  const queue = useRef([])
  const cancelled = useRef(false)
  const serial = useRef(0)

  function addFiles(fileList) {
    const files = [...fileList]
    const accepted = []
    const issues = []
    for (const file of files) {
      if (!ACCEPTED.test(file.name)) issues.push(`${file.name}: choose a PDF or DOCX file.`)
      else if (file.size > MAX_FILE_BYTES) issues.push(`${file.name}: files must be 5 MB or smaller.`)
      else if (rows.length + accepted.length >= MAX_FILES) issues.push('You can queue up to five files at a time.')
      else accepted.push(file)
    }
    if (accepted.length) setRows((current) => [...current, ...accepted.map((file) => ({ id: ++serial.current, file, status: 'Queued', warnings: [], review: null, error: '' }))])
    setError(issues.join(' '))
  }

  async function processQueue() {
    if (busy || disabled || rows.length === 0) return
    cancelled.current = false
    setCancelRemaining(false)
    setBusy(true)
    const pending = rows.filter((row) => row.status === 'Queued' || row.status === 'Retry queued')
    const completedReviews = [...rows.filter((row) => row.review)]
    for (const row of pending) {
      if (cancelled.current) break
      setRows((current) => current.map((item) => item.id === row.id ? { ...item, status: 'Extracting', error: '' } : item))
      try {
        const extraction = await api.extractDocument(row.file, { onSlow: () => setSlow(true), onSlowComplete: () => setSlow(false), slowAfterMs: 8_000 })
        setRows((current) => current.map((item) => item.id === row.id ? { ...item, status: 'Reviewing', warnings: extraction.warnings ?? [] } : item))
        const review = await api.createReview(
          extraction.text,
          brandName.trim() || 'Nimbus Notes',
          useAI,
          qualityChecks,
          { kind: 'document', filename: extraction.filename, fileType: extraction.fileType, pageCount: extraction.pageCount, charCount: extraction.charCount, truncated: extraction.truncated },
          { onSlow: () => setSlow(true), onSlowComplete: () => setSlow(false), slowAfterMs: 8_000 },
          brandId || undefined,
        )
        completedReviews.push({ ...row, review })
        setRows((current) => current.map((item) => item.id === row.id ? { ...item, status: 'Done', review } : item))
      } catch (requestError) {
        setRows((current) => current.map((item) => item.id === row.id ? { ...item, status: 'Failed', error: requestError.message || 'This document could not be reviewed.' } : item))
      }
    }
    setBusy(false)
    setCancelRemaining(false)
    if (rows.length === 1 && completedReviews.length === 1) onOpenReview(completedReviews[0].review._id)
  }

  function retry(id) {
    setRows((current) => current.map((row) => row.id === id ? { ...row, status: 'Retry queued', error: '', review: null } : row))
  }
  function remove(id) { setRows((current) => current.filter((row) => row.id !== id)) }
  function cancel() {
    cancelled.current = true
    setCancelRemaining(true)
    setRows((current) => current.map((row) => row.status === 'Queued' || row.status === 'Retry queued' ? { ...row, status: 'Cancelled' } : row))
  }
  const successes = rows.filter((row) => row.review)
  const allComplete = rows.length > 0 && !busy && rows.every((row) => !['Queued', 'Retry queued', 'Extracting', 'Reviewing'].includes(row.status))

  async function exportBatchSummary() {
    if (exportingSummary || successes.length === 0) return
    setExportingSummary(true)
    setExportError('')
    try {
      const result = await api.getReportSummary(successes.map((row) => row.review._id))
      if (result.rows.length) downloadText(summaryCsv(result.rows), safeReportFilename('upload-batch-summary', new Date(), 'csv'), 'text/csv;charset=utf-8')
      if (result.missing.length) setExportError(`${result.missing.length} review${result.missing.length === 1 ? '' : 's'} no longer exist and were skipped.`)
    } catch (requestError) { setExportError(requestError.message || 'The batch summary could not be exported.') }
    finally { setExportingSummary(false) }
  }

  return (
    <section className="input-panel document-panel" aria-label="Upload documents for review">
      <div className="input-panel-header"><div><p className="eyebrow">Document review</p><h2>Upload PDF or DOCX files</h2></div><FolderUp aria-hidden="true" size={20} /></div>
      <p className="document-intro">Queue up to five files (5 MB each). We extract and review them one at a time.</p>
      <button className="document-dropzone" disabled={disabled || busy} onClick={() => inputRef.current?.click()} onDragOver={(event) => event.preventDefault()} onDrop={(event) => { event.preventDefault(); addFiles(event.dataTransfer.files) }} type="button">
        <FileText size={22} /><strong>Choose files or drop them here</strong><span>PDF and DOCX · up to 5 MB each</span>
      </button>
      <input ref={inputRef} accept=".pdf,.docx,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document" className="visually-hidden" multiple onChange={(event) => { addFiles(event.target.files); event.target.value = '' }} type="file" />
      {!hideBrandName && <><label className="field-label" htmlFor="upload-brand-name">Legacy brand name</label>
      <input autoComplete="organization" className="text-input single-line" disabled={busy || disabled} id="upload-brand-name" maxLength={100} onChange={(event) => setBrandName(event.target.value)} value={brandName} /></>}
      <label className="ai-toggle"><input checked={useAI} disabled={busy || disabled} onChange={(event) => onUseAIChange(event.target.checked)} type="checkbox" /><span>AI-assisted analysis</span><small>On by default; AI checks are validated against each document section.</small></label>
      <label className="ai-toggle"><input checked={qualityChecks} disabled={busy || disabled} onChange={(event) => onQualityChecksChange(event.target.checked)} type="checkbox" /><span>Run readability and accessibility checks</span><small>Deterministic checks run across the full document.</small></label>
      {error && <p className="inline-warning" role="alert">{error}</p>}
      {slow && <p className="waking-message" role="status">This is taking longer than usual. The server may still be processing the document.</p>}
      {rows.length > 0 && <div className="upload-queue"><div className="upload-queue-heading"><strong>Queue ({rows.length}/{MAX_FILES})</strong>{busy && <button className="button-secondary button-small" onClick={cancel} type="button">Cancel remaining</button>}</div>
        {rows.map((row) => <article className="upload-row" key={row.id}><div className="upload-row-main"><FileText aria-hidden="true" size={16} /><div><strong>{row.file.name}</strong><span>{row.status}{row.error && ` · ${row.error}`}</span>{row.warnings.map((warning) => <small key={warning}>{warning}</small>)}</div></div><div className="upload-row-actions">{['Extracting', 'Reviewing'].includes(row.status) && <LoaderCircle aria-label={row.status} className="animate-spin" size={16} />}{row.status === 'Failed' && <button aria-label={`Retry ${row.file.name}`} className="icon-button" onClick={() => retry(row.id)} type="button"><RotateCcw size={14} /></button>}{!busy && row.status !== 'Done' && <button aria-label={`Remove ${row.file.name}`} className="icon-button" onClick={() => remove(row.id)} type="button"><X size={14} /></button>}</div></article>)}
      </div>}
      {!busy && rows.some((row) => row.status === 'Queued' || row.status === 'Retry queued') && <button className="button-primary" disabled={disabled} onClick={processQueue} type="button">{rows.some((row) => row.status === 'Failed') ? 'Start / retry queued files' : 'Review queued files'}</button>}
      {allComplete && rows.length > 1 && successes.length > 0 && <div className="upload-results"><h3>Batch summary</h3><div className="upload-result-table" role="table" aria-label="Document review results"><div className="upload-result-head" role="row"><span role="columnheader">Document</span><span role="columnheader">Findings</span><span role="columnheader">Status</span></div>{successes.map((row) => <div className="upload-result-row" key={row.id} role="row"><span role="cell">{row.file.name}</span><span role="cell">{row.review.summary?.total ?? row.review.findings?.length ?? 0}</span><span role="cell"><button className="text-link-button" onClick={() => onOpenReview(row.review._id)} type="button">Open</button></span></div>)}</div><div className="upload-batch-actions"><button className="button-primary" onClick={() => onOpenReview(successes[0].review._id)} type="button">Open first review</button><button className="button-secondary" disabled={exportingSummary} onClick={exportBatchSummary} type="button">{exportingSummary ? 'Preparing CSV…' : 'Export batch summary (CSV)'}</button></div>{exportError && <p className="inline-warning" role="status">{exportError}</p>}</div>}
      {busy && <p className="document-progress" role="status">Processing documents in order…</p>}
    </section>
  )
}

export default DocumentUploadPanel
