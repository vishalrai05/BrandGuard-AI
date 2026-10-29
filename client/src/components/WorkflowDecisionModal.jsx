import { useEffect, useRef, useState } from 'react'
import { LoaderCircle, X } from 'lucide-react'

function WorkflowDecisionModal({ decision, busy, error, onClose, onConfirm }) {
  const [note, setNote] = useState('')
  const dialogRef = useRef(null)
  const isRequestChanges = decision === 'request-changes'

  useEffect(() => {
    const previousFocus = document.activeElement
    const dialog = dialogRef.current
    const focusable = dialog?.querySelectorAll('button:not([disabled]), textarea:not([disabled])')
    focusable?.[0]?.focus()
    function onKeyDown(event) {
      if (event.key === 'Escape' && !busy) onClose()
      if (event.key !== 'Tab' || !focusable?.length) return
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
    window.addEventListener('keydown', onKeyDown)
    return () => {
      window.removeEventListener('keydown', onKeyDown)
      if (previousFocus instanceof HTMLElement) previousFocus.focus()
    }
  }, [busy, onClose])

  return (
    <div className="modal-backdrop workflow-modal-backdrop" onMouseDown={(event) => { if (!busy && event.target === event.currentTarget) onClose() }}>
      <section aria-labelledby="workflow-modal-title" aria-modal="true" className="workflow-modal" ref={dialogRef} role="dialog">
        <div className="modal-header">
          <div><p className="eyebrow">Approval decision</p><h2 id="workflow-modal-title">{isRequestChanges ? 'Request changes' : 'Approve review'}</h2></div>
          <button aria-label="Close decision dialog" className="icon-button" disabled={busy} onClick={onClose} type="button"><X size={18} /></button>
        </div>
        <p className="workflow-modal-description">{isRequestChanges ? 'Tell the reviewer what needs to change before resubmitting.' : 'Add an optional note for the audit record.'}</p>
        <label className="field-label" htmlFor="decision-note">Decision note {isRequestChanges ? <span>Required · 1–500 characters</span> : <span>Optional · up to 500 characters</span>}</label>
        <textarea
          aria-describedby={error ? 'decision-error' : undefined}
          autoComplete="off"
          className="text-input decision-note-input"
          id="decision-note"
          maxLength={500}
          onChange={(event) => setNote(event.target.value)}
          placeholder={isRequestChanges ? 'Describe what should be revised...' : 'Add an approval note...'}
          required={isRequestChanges}
          value={note}
        />
        <div aria-live="polite" className="decision-note-count">{note.length} / 500</div>
        {error && <p className="auth-error" id="decision-error" role="alert">{error}</p>}
        <div className="workflow-modal-actions">
          <button className="button-secondary" disabled={busy} onClick={onClose} type="button">Cancel</button>
          <button className="button-primary" disabled={busy || (isRequestChanges && !note.trim())} onClick={() => onConfirm(note.trim())} type="button">
            {busy ? <><LoaderCircle className="animate-spin" size={15} /> Saving</> : isRequestChanges ? 'Request changes' : 'Approve review'}
          </button>
        </div>
      </section>
    </div>
  )
}

export default WorkflowDecisionModal
