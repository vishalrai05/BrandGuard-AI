import { useEffect, useRef, useState } from 'react'
import { api } from '../api/client.js'

const MAX_GUIDELINE_CHARS = 60_000

function plainReason(reason) {
  const labels = {
    'excerpt not found': 'the quoted excerpt was not found in the guideline',
    'banned term not found in excerpt': 'a suggested banned term was not present in its quote',
    'required phrase not found in excerpt': 'a required phrase was not present in its quote',
    'number not supported by excerpt': 'a number was not supported by its quote',
    'invalid excerpt': 'the quoted excerpt was missing or too long',
    'Duplicate of an existing or earlier suggestion': 'the suggestion duplicates an existing rule or fact',
    'Sections exceeded the configured chunk limit': 'some document sections were over the analysis limit',
    'Suggestions exceeded the configured item limit': 'some suggestions were over the item limit',
  }
  if (labels[reason]) return labels[reason]
  if (reason.startsWith('invalid rule:')) return 'the rule failed safety or field validation'
  if (reason.startsWith('invalid ')) return 'the suggestion had missing or invalid fields'
  if (reason === 'AI section could not be analysed') return 'a section could not be analysed'
  return 'the suggestion did not pass validation'
}

function GuidelineImportModal({ brandId, brandName, onClose, onSaved, onImported }) {
  const [tab, setTab] = useState('upload')
  const [file, setFile] = useState(null)
  const [text, setText] = useState('')
  const [filename, setFilename] = useState('')
  const [state, setState] = useState('idle')
  const [error, setError] = useState('')
  const [result, setResult] = useState(null)
  const [slow, setSlow] = useState(false)
  const [sectionProgress, setSectionProgress] = useState({ current: 1, total: 1 })
  const abortRef = useRef(null)
  const onCloseRef = useRef(onClose)
  const stateRef = useRef(state)
  onCloseRef.current = onClose
  stateRef.current = state

  useEffect(() => {
    const previous = document.activeElement
    const dialog = document.querySelector('[data-guideline-dialog]')
    dialog?.querySelector('button:not([disabled]), input:not([disabled]), textarea:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex="-1"])')?.focus()
    function onKeyDown(event) {
      if (event.key === 'Escape' && stateRef.current !== 'extracting' && stateRef.current !== 'analysing') onCloseRef.current()
      const focusable = [...(dialog?.querySelectorAll('button:not([disabled]), input:not([disabled]), textarea:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex="-1"])') ?? [])]
      if (event.key === 'Tab' && focusable.length) {
        if (event.shiftKey && document.activeElement === focusable[0]) { event.preventDefault(); focusable.at(-1).focus() }
        else if (!event.shiftKey && document.activeElement === focusable.at(-1)) { event.preventDefault(); focusable[0].focus() }
      }
    }
    window.addEventListener('keydown', onKeyDown)
    return () => { window.removeEventListener('keydown', onKeyDown); if (previous instanceof HTMLElement) previous.focus() }
  }, [])

  function cancel() {
    abortRef.current?.abort()
    abortRef.current = null
    setState('idle')
    setSlow(false)
  }

  async function runImport(event) {
    event.preventDefault()
    setError(''); setSlow(false); setResult(null)
    const controller = new AbortController()
    abortRef.current = controller
    let sourceText = text
    let sourceFilename = filename.trim() || 'pasted-guideline.txt'
    try {
      if (tab === 'upload') {
        if (!file) { setError('Choose a PDF or DOCX guideline first.'); return }
        if (file.size > 5 * 1024 * 1024) { setError('File is too large. Maximum upload size is 5 MB.'); return }
        setState('extracting')
        const extracted = await api.extractDocument(file, { signal: controller.signal, onSlow: () => setSlow(true), onSlowComplete: () => {} , slowAfterMs: 8_000 })
        sourceText = extracted.text
        sourceFilename = extracted.filename
      } else {
        sourceFilename = sourceFilename || 'pasted-guideline.txt'
      }
      if (!sourceText.trim()) { setError('Paste or upload readable guideline text.'); setState('idle'); return }
      if (sourceText.length > MAX_GUIDELINE_CHARS) { setError('Guideline text is over the 60,000 character limit.'); setState('idle'); return }
      setState('analysing')
      const estimatedSections = Math.max(1, Math.ceil(sourceText.length / 6_000))
      setSectionProgress({ current: 1, total: estimatedSections })
      const progressTimer = setInterval(() => setSectionProgress((progress) => ({ ...progress, current: Math.min(Math.max(1, progress.total - 1), progress.current + 1) })), 3_000)
      const hint = setTimeout(() => setSlow(true), 8_000)
      try {
        const imported = await api.ingestGuideline(brandId, { text: sourceText, filename: sourceFilename }, { signal: controller.signal, onSlow: () => setSlow(true), onSlowComplete: () => {}, slowAfterMs: 8_000 })
        setResult(imported)
        setState('done')
        onSaved?.(imported)
      } finally { clearTimeout(hint); clearInterval(progressTimer) }
    } catch (requestError) {
      if (requestError.name !== 'AbortError') setError(requestError.message || 'Guideline import failed. Please try again.')
      setState('idle')
    } finally { abortRef.current = null }
  }

  const busy = state === 'extracting' || state === 'analysing'
  const droppedCount = result?.dropped?.reduce((sum, item) => sum + item.count, 0) ?? 0
  return <div className="modal-backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget && !busy) onClose() }}><section aria-labelledby="guideline-import-title" aria-modal="true" className="new-review-modal guideline-import-modal" data-guideline-dialog role="dialog">
    <div className="modal-header"><div><p className="eyebrow">{brandName}</p><h2 id="guideline-import-title">Import brand guidelines</h2></div><button aria-label="Close guideline import" className="icon-button" disabled={busy} onClick={onClose} type="button">×</button></div>
    {!result && <><p className="guideline-ai-notice">The guideline text will be sent to the configured AI provider for analysis. AI suggestions are drafts only; nothing will affect reviews until an approver approves it.</p>
      <div aria-label="Guideline input method" className="library-status-tabs" role="tablist"><button aria-selected={tab === 'upload'} className={tab === 'upload' ? 'review-mode-tab active' : 'review-mode-tab'} onClick={() => setTab('upload')} role="tab" type="button">Upload</button><button aria-selected={tab === 'paste'} className={tab === 'paste' ? 'review-mode-tab active' : 'review-mode-tab'} onClick={() => setTab('paste')} role="tab" type="button">Paste text</button></div>
      <form className="guideline-import-form" onSubmit={runImport}>{tab === 'upload' ? <><label className="field-label" htmlFor="guideline-file">PDF or DOCX guideline</label><input accept=".pdf,.docx,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document" className="text-input" disabled={busy} id="guideline-file" onChange={(event) => setFile(event.target.files?.[0] ?? null)} type="file" />{file && <p>{file.name} · {(file.size / 1024 / 1024).toFixed(1)} MB</p>}</> : <><label className="field-label" htmlFor="guideline-filename">Document name (optional)</label><input className="text-input" id="guideline-filename" maxLength={120} onChange={(event) => setFilename(event.target.value)} placeholder="brand-guidelines.txt" value={filename} /><label className="field-label" htmlFor="guideline-text">Guideline text</label><textarea className="text-input guideline-paste" id="guideline-text" maxLength={MAX_GUIDELINE_CHARS} onChange={(event) => setText(event.target.value)} value={text} /></>}
        {state === 'extracting' && <p role="status">Extracting text from the document…</p>}{state === 'analysing' && <p aria-live="polite" role="status">Analysing section {sectionProgress.current} of about {sectionProgress.total}…</p>}{slow && busy && <p className="waking-message" role="status">Free hosting may be waking up. This import can take a little longer.</p>}{error && <p className="inline-warning" role="alert">{error}</p>}
        <div className="input-actions"><button className="button-secondary" disabled={busy} onClick={onClose} type="button">Cancel</button>{busy && <button className="button-secondary" onClick={cancel} type="button">Stop import</button>}<button className="button-primary" disabled={busy || (tab === 'upload' ? !file : !text.trim())} type="submit">{busy ? 'Working…' : 'Analyse and draft'}</button></div>
      </form></>}
    {result && <div className="guideline-import-result"><p className={result.status === 'partial' ? 'inline-warning' : 'inline-success'} role="status">{result.message}</p><div className="guideline-counts"><strong>{result.rules.length} draft rules</strong><strong>{result.facts.length} draft facts</strong><strong>{droppedCount} dropped</strong></div>{droppedCount > 0 && <ul>{result.dropped.map((item) => <li key={item.reason}>{item.count} suggestion{item.count === 1 ? '' : 's'} dropped because {plainReason(item.reason)}.</li>)}</ul>}<p>Sections analysed: {result.run.chunksAnalysed} of {result.run.chunksTotal}</p><div className="input-actions"><button className="button-secondary" onClick={onClose} type="button">Close</button><button className="button-primary" onClick={() => onImported?.(result, true)} type="button">Review drafts</button></div></div>}
  </section></div>
}

export default GuidelineImportModal
