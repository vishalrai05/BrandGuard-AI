import { useCallback, useEffect, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { ArrowLeft, Clipboard, Download, FileDown, Printer, RefreshCw } from 'lucide-react'
import { api } from '../api/client.js'
import LoadingState from '../components/LoadingState.jsx'
import { copyText } from '../utils/copyText.js'
import { downloadText, findingsCsv, reportSummaryText, safeReportFilename } from '../utils/reportExport.js'

function dateLabel(value) {
  if (!value) return 'Not recorded'
  const date = new Date(value)
  return Number.isFinite(date.getTime()) ? date.toLocaleString() : 'Not recorded'
}

function titleCase(value = '') { return value.replaceAll('_', ' ').replace(/\b\w/g, (letter) => letter.toUpperCase()) }
function sourceLabel(finding) {
  if (finding.type === 'needs_verification') return 'VERIFY'
  return ({ rules: 'RULE', ai: 'AI', check: 'CHECK' })[finding.source] ?? 'RULE'
}

function FindingReportCard({ finding, options }) {
  const changedBy = finding.statusChangedBy
  return (
    <article className={`report-finding report-severity-${finding.severity}`}>
      <header className="report-finding-heading">
        <span className="report-finding-number">#{finding.number}</span>
        <span className="report-source-label">{sourceLabel(finding)}</span>
        <strong>{titleCase(finding.severity)} severity</strong>
        <span className="report-finding-type">{titleCase(finding.type)}</span>
      </header>
      <p className="report-evidence-title"><strong>{finding.evidence.refCode || 'No evidence code'}</strong>{finding.evidence.title && ` · ${finding.evidence.title}`}</p>
      {finding.evidence.sourceName && <p className="report-source-name">Fact source: {finding.evidence.sourceName}</p>}
      <blockquote className="report-quote">{finding.matchedText || 'No quoted text'}</blockquote>
      {finding.evidence.excerpt && <p className="report-evidence-excerpt">{finding.evidence.excerpt}</p>}
      {(finding.suggestedRewrite || finding.suggestion) && <div className="report-suggestion"><strong>{finding.suggestedRewrite ? 'Suggested rewrite' : 'Suggestion'}</strong><p>{finding.suggestedRewrite || finding.suggestion}</p>{finding.suggestedRewrite && finding.suggestion && <p className="report-original-suggestion">{finding.suggestion}</p>}</div>}
      <p className="report-triage"><strong>Status: {titleCase(finding.status)}</strong>{changedBy && <> · changed by {changedBy.name} ({changedBy.role})</>}{finding.statusChangedAt && <> · {dateLabel(finding.statusChangedAt)}</>}</p>
      {options.includeComments && finding.comments.length > 0 && <div className="report-comments"><strong>Comments</strong>{finding.comments.map((comment, index) => <blockquote key={`${finding.number}-${index}`}><p>{comment.text}</p><footer>{comment.authorName} ({comment.authorRole}) · {dateLabel(comment.createdAt)}</footer></blockquote>)}</div>}
    </article>
  )
}

function ReportPage() {
  const { id } = useParams()
  const navigate = useNavigate()
  const [options, setOptions] = useState({ includeComments: true, includeAudit: true, includeFullText: false })
  const [report, setReport] = useState(null)
  const [state, setState] = useState('loading')
  const [error, setError] = useState('')
  const [message, setMessage] = useState('')

  const load = useCallback(async (nextOptions) => {
    setState('loading')
    setError('')
    try {
      const result = await api.getReport(id, nextOptions)
      setReport(result)
      setState('success')
    } catch (loadError) {
      setError(loadError.message || 'The report could not be loaded.')
      setState('error')
    }
  }, [id])

  useEffect(() => { load(options) }, [load, options])

  function updateOption(key, checked) {
    const next = { ...options, [key]: checked }
    setOptions(next)
  }

  async function copyFingerprint() {
    const copied = await copyText(report.fingerprint)
    setMessage(copied ? 'Full fingerprint copied.' : 'Could not copy the fingerprint.')
  }

  async function copySummary() {
    try {
      const copied = await copyText(reportSummaryText(report))
      setMessage(copied ? 'Summary copied.' : 'Could not copy the summary.')
    } catch { setMessage('Could not copy the summary.') }
  }

  function downloadJson() {
    const name = report.review.source?.filename || report.review.brandName
    downloadText(JSON.stringify(report, null, 2), safeReportFilename(name, report.generatedAt, 'json'), 'application/json;charset=utf-8')
  }

  function downloadCsv() {
    const name = report.review.source?.filename || report.review.brandName
    downloadText(findingsCsv(report), safeReportFilename(name, report.generatedAt, 'csv'), 'text/csv;charset=utf-8')
  }

  if (state === 'loading' && !report) return <LoadingState label="Preparing compliance report…" />
  if (state === 'error' && !report) return <div className="report-state"><h1>Report unavailable</h1><p>{error}</p><div><button className="button-secondary" onClick={() => load(options)} type="button"><RefreshCw size={14} /> Retry</button><button className="button-secondary" onClick={() => navigate(`/reviews/${id}`)} type="button">Back to review</button></div></div>
  if (!report) return <div className="report-state"><h1>No report data</h1><p>This review did not return a compliance report.</p><Link className="button-secondary" to={`/reviews/${id}`}>Back to review</Link></div>

  const review = report.review
  const approval = report.approval
  const groups = [
    ['High severity', report.sections.highSeverity],
    ['Medium severity', report.sections.mediumSeverity],
    ['Low severity', report.sections.lowSeverity],
  ]
  const fileLabel = review.source?.kind === 'document'
    ? `${review.source.filename} · ${review.source.fileType?.toUpperCase()} · ${review.source.pageCount ?? '—'} pages · ${(review.source.charCount ?? 0).toLocaleString()} characters`
    : 'Pasted text'

  return (
    <article aria-label="Brand Compliance Report" className="report-page">
      <div className="report-controls no-print">
        <div className="report-option-panel" aria-label="Report options">
          <label><input checked={options.includeComments} onChange={(event) => updateOption('includeComments', event.target.checked)} type="checkbox" /> Include comments</label>
          <label><input checked={options.includeAudit} onChange={(event) => updateOption('includeAudit', event.target.checked)} type="checkbox" /> Include audit trail</label>
          <label><input checked={options.includeFullText} onChange={(event) => updateOption('includeFullText', event.target.checked)} type="checkbox" /> Include full text of the document</label>
          <p className="full-text-warning">Full text includes the entire submitted copy and may contain confidential information.</p>
        </div>
        <div className="report-action-panel" aria-label="Report actions">
          <button className="button-primary" onClick={() => window.print()} type="button"><Printer size={14} /> Print / Save as PDF</button>
          <button className="button-secondary" onClick={downloadCsv} type="button"><Download size={14} /> Download CSV</button>
          <button className="button-secondary" onClick={downloadJson} type="button"><FileDown size={14} /> Download JSON</button>
          <button className="button-secondary" onClick={copySummary} type="button"><Clipboard size={14} /> Copy summary</button>
          <button className="button-secondary" onClick={() => navigate(`/reviews/${id}`)} type="button"><ArrowLeft size={14} /> Back to review</button>
        </div>
      </div>
      {message && <p className="report-copy-message no-print" aria-live="polite">{message}</p>}
      {state === 'loading' && <p className="report-refreshing no-print" role="status">Refreshing report…</p>}
      {state === 'error' && <p className="inline-warning no-print" role="alert">The refreshed report could not be loaded: {error}</p>}

      <header className="report-header">
        <p className="eyebrow">BrandGuard AI · Evidence export</p>
        <h1>Brand Compliance Report</h1>
        <h2>{review.brandName}</h2>
        <dl className="report-meta-grid">
          <div><dt>Review date</dt><dd>{dateLabel(review.createdAt)}</dd></div>
          <div><dt>Report ID</dt><dd>{report.reportId}</dd></div>
          <div><dt>Generated at</dt><dd>{dateLabel(report.generatedAt)}</dd></div>
          <div><dt>Generated by</dt><dd>{report.generatedBy?.name || 'Unknown'}{report.generatedBy?.role ? ` · ${report.generatedBy.role}` : ''}</dd></div>
        </dl>
        <div className="report-fingerprint"><strong>Review fingerprint</strong><code title={report.fingerprint}>{report.fingerprint.slice(0, 20)}…</code><button aria-label="Copy full review fingerprint" className="text-link-button no-print" onClick={copyFingerprint} type="button"><Clipboard size={12} /> Copy</button><small>Tamper-evidence aid, not a digital signature.</small></div>
      </header>

      {approval.status !== 'approved' && <div className="report-not-approved" role="status"><strong>Not approved: draft report</strong><span>This export records the review state at the time it was generated.</span></div>}

      <section className="report-section report-status" aria-labelledby="report-status-heading">
        <div className="report-section-heading"><p className="eyebrow">Workflow</p><h2 id="report-status-heading">{titleCase(approval.status)}</h2></div>
        <dl className="report-meta-grid">
          <div><dt>Submitted by</dt><dd>{approval.submittedBy?.name || 'Not submitted'}{approval.submittedBy?.role ? ` · ${approval.submittedBy.role}` : ''}</dd></div>
          <div><dt>Submitted at</dt><dd>{dateLabel(approval.submittedAt)}</dd></div>
          <div><dt>{approval.status === 'approved' ? 'Approved by' : approval.status === 'changes_requested' ? 'Changes requested by' : 'Decision by'}</dt><dd>{approval.decidedBy?.name || 'No decision'}{approval.decidedBy?.role ? ` · ${approval.decidedBy.role}` : ''}</dd></div>
          <div><dt>Decision time</dt><dd>{dateLabel(approval.decidedAt)}</dd></div>
        </dl>
        {approval.decisionNote && <p className="report-decision-note"><strong>Decision note:</strong> {approval.decisionNote}</p>}
      </section>

      <section className="report-section" aria-labelledby="report-summary-heading">
        <div className="report-section-heading"><p className="eyebrow">At a glance</p><h2 id="report-summary-heading">Summary</h2></div>
        <div className="report-metric-grid">
          <div><strong>{report.summary.complianceScore}<small>/100</small></strong><span>Compliance score</span></div>
          <div><strong>{report.summary.total}</strong><span>Total findings</span></div>
          <div><strong>{report.summary.needsVerification}</strong><span>Needs verification</span></div>
          <div><strong>{report.summary.high}</strong><span>High severity</span></div>
          <div><strong>{report.summary.medium}</strong><span>Medium severity</span></div>
          <div><strong>{report.summary.low}</strong><span>Low severity</span></div>
        </div>
        <p className="report-triage-counts">Triage: {report.summary.byStatus.open} open · {report.summary.byStatus.accepted} accepted · {report.summary.byStatus.dismissed} dismissed</p>
        {report.summary.readability && <div className="report-readability"><h3>Readability</h3><p>{report.summary.readability.wordCount ?? 0} words · {report.summary.readability.sentenceCount ?? 0} sentences · {report.summary.readability.avgSentenceLength ?? 0} average words per sentence · Reading ease {report.summary.readability.fleschReadingEase ?? '—'} · Grade {report.summary.readability.fleschKincaidGrade ?? '—'} · {report.summary.readability.longSentenceCount ?? 0} long sentences</p></div>}
      </section>

      <section className="report-section report-source-block" aria-labelledby="report-source-heading">
        <div className="report-section-heading"><p className="eyebrow">Coverage</p><h2 id="report-source-heading">Source and analysis</h2></div>
        <p><strong>Source:</strong> {fileLabel}</p>
        <p><strong>AI usage:</strong> {report.disclosures.filter((item) => item.startsWith('AI')).join('; ') || 'AI status unavailable'}{report.review.ai?.message ? ` — ${report.review.ai.message}` : ''}</p>
      </section>

      <section className="report-section" aria-labelledby="report-findings-heading">
        <div className="report-section-heading"><p className="eyebrow">Evidence detail</p><h2 id="report-findings-heading">Findings ({report.findings.length})</h2></div>
        {report.findings.length === 0 && <p className="report-empty-findings">No findings were recorded for this review.</p>}
        {groups.map(([heading, findings]) => findings.length > 0 && <section className="report-finding-group" key={heading}><h3>{heading} <span>({findings.length})</span></h3>{findings.map((finding) => <FindingReportCard finding={finding} key={`${finding.number}-${finding.type}`} options={options} />)}</section>)}
      </section>

      {options.includeAudit && <section className="report-section" aria-labelledby="report-audit-heading">
        <div className="report-section-heading"><p className="eyebrow">Record</p><h2 id="report-audit-heading">Audit trail</h2></div>
        {report.auditTrail.length ? <div className="report-table-wrap"><table className="report-audit-table"><thead><tr><th>At</th><th>Actor</th><th>Action</th><th>Change / note</th></tr></thead><tbody>{report.auditTrail.map((entry, index) => <tr key={`${entry.action}-${entry.at}-${index}`}><td>{dateLabel(entry.at)}</td><td>{entry.actorName} ({entry.actorRole})</td><td>{titleCase(entry.action)}</td><td>{[entry.from && `${titleCase(entry.from)} → `, entry.to && titleCase(entry.to), entry.note].filter(Boolean).join(' · ') || '—'}</td></tr>)}</tbody></table></div> : <p>No audit entries were included.</p>}
      </section>}

      {options.includeFullText && <section className="report-section report-full-text"><div className="report-section-heading"><p className="eyebrow">Submitted material</p><h2>Full submitted text</h2></div><pre>{report.fullText}</pre></section>}

      <footer className="report-footer"><section className="report-section"><div className="report-section-heading"><p className="eyebrow">Method and limits</p><h2>Disclosures</h2></div><ul>{report.disclosures.map((disclosure) => <li key={disclosure}>{disclosure}</li>)}</ul><p>Library snapshot: {report.library.rulesCount} rules · {report.library.factsCount} facts · {report.library.qualityChecksCount} quality checks.</p><p className="report-fingerprint-disclaimer">Fingerprint: {report.fingerprint}. This SHA-256 digest is a tamper-evidence aid that changes with findings, their statuses, workflow status, or decision time. It is not a digital signature and does not prove who generated this report.</p></section></footer>
      <div className="print-page-footer" aria-hidden="true">BrandGuard report {report.reportId} · Page <span className="page-number" /></div>
    </article>
  )
}

export default ReportPage
