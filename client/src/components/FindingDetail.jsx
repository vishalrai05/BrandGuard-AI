import { useState } from 'react'
import { Check, Copy, ExternalLink, RotateCcw, ShieldAlert, X, ScanText } from 'lucide-react'
import Pill from './Pill.jsx'
import { copyText } from '../utils/copyText.js'
import { findingTypeLabel } from '../utils/findingLabels.js'

function FindingDetail({ finding, review, evidenceRecord, onStatusChange, updating, onToast, onViewText }) {
  // Notes intentionally stay in local drawer state as an unsaved draft.
  const [note, setNote] = useState('')
  if (!finding) return null
  const start = Math.max(0, finding.startIndex - 90)
  const end = Math.min(review.inputText.length, finding.endIndex + 90)

  async function copySuggestion() {
    try {
      onToast(await copyText(finding.suggestion ?? '') ? 'Suggestion copied' : 'Could not copy suggestion')
    } catch {
      onToast('Could not copy suggestion')
    }
  }

  async function copyRewrite() {
    try {
      onToast(await copyText(finding.suggestedRewrite ?? '') ? 'Rewrite copied' : 'Could not copy rewrite')
    } catch {
      onToast('Could not copy rewrite')
    }
  }

  return (
    <div className="detail-content">
      <div className="detail-pills">
        <Pill tone={finding.type === 'needs_verification' ? 'verification' : finding.severity}>{findingTypeLabel(finding, evidenceRecord)}</Pill>
        <Pill tone="neutral">{finding.status}</Pill>
        {finding.source === 'ai' && <Pill tone="neutral">AI</Pill>}
      </div>
      <section className="detail-section">
        <h3><ShieldAlert size={16} /> Matched text in context</h3>
        <blockquote className="context-quote">
          {review.inputText.slice(start, finding.startIndex)}
          <mark>{finding.matchedText}</mark>
          {review.inputText.slice(finding.endIndex, end)}
        </blockquote>
      </section>
      {finding.source === 'ai' && finding.reason && (
        <section className="detail-section">
          <h3>AI rationale</h3>
          <p className="detail-copy">{finding.reason}</p>
        </section>
      )}
      <section className="detail-section">
        <h3>Evidence</h3>
        {finding.type === 'needs_verification' ? (
          <p className="verification-note">No supporting fact found in the library. Verify before publishing.</p>
        ) : (
          <>
            <p className="detail-evidence-title">{finding.evidence?.refCode} · {evidenceRecord?.title ?? evidenceRecord?.statement ?? 'Evidence reference'}</p>
            <p className="detail-copy">{finding.evidence?.excerpt || evidenceRecord?.description || evidenceRecord?.statement}</p>
            {evidenceRecord?.source?.name && (
              <p className="source-line">
                Source: {evidenceRecord.source.url
                  ? <a href={evidenceRecord.source.url} rel="noreferrer" target="_blank">{evidenceRecord.source.name} <ExternalLink size={13} /></a>
                  : evidenceRecord.source.name}
              </p>
            )}
          </>
        )}
      </section>
      <button className="button-secondary view-text-button" onClick={onViewText} type="button"><ScanText size={15} /> View in text</button>
      {finding.suggestion && (
        <section className="detail-section">
          <div className="detail-heading-row"><h3>Suggested fix</h3><button className="button-secondary button-small" onClick={copySuggestion} type="button"><Copy size={14} /> Copy</button></div>
          <p className="suggestion-box">{finding.suggestion}</p>
        </section>
      )}
      {finding.suggestedRewrite && (
        <section className="detail-section">
          <div className="detail-heading-row"><h3>Compliant rewrite</h3><button className="button-secondary button-small" onClick={copyRewrite} type="button"><Copy size={14} /> Copy</button></div>
          <p className="suggestion-box">{finding.suggestedRewrite}</p>
        </section>
      )}
      <section className="detail-section">
        <label className="field-label" htmlFor={`note-${finding._id}`}>Review note <span>Draft only</span></label>
        <textarea className="text-input note-input" id={`note-${finding._id}`} onChange={(event) => setNote(event.target.value)} placeholder="Add a private note for this review..." value={note} />
      </section>
      <div className="drawer-actions">
        {finding.status !== 'open' ? (
          <button className="button-secondary" disabled={updating} onClick={() => onStatusChange(finding, 'open')} type="button"><RotateCcw size={15} /> Reopen</button>
        ) : (
          <>
            <button className="button-success" disabled={updating} onClick={() => onStatusChange(finding, 'accepted')} type="button"><Check size={15} /> Accept</button>
            <button className="button-secondary" disabled={updating} onClick={() => onStatusChange(finding, 'dismissed')} type="button"><X size={15} /> Dismiss</button>
          </>
        )}
      </div>
    </div>
  )
}

export default FindingDetail
