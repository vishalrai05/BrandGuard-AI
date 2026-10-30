import { useEffect, useMemo, useState } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { ExternalLink, FileClock, Plus, Search } from 'lucide-react'
import { api } from '../api/client.js'
import LoadingState from '../components/LoadingState.jsx'
import Pill from '../components/Pill.jsx'
import GuidelineImportModal from '../components/GuidelineImportModal.jsx'
import { useAuth } from '../context/AuthContext.jsx'
import '../styles/library.css'

const statusTabs = ['active', 'draft', 'rejected', 'archived']
const labels = { active: 'Active', draft: 'Drafts', rejected: 'Rejected', archived: 'Archived' }

function LibraryPage({ kind }) {
  const isRule = kind === 'rule'
  const navigate = useNavigate()
  const location = useLocation()
  const { user } = useAuth()
  const [brands, setBrands] = useState([])
  const [brandId, setBrandId] = useState(() => window.localStorage.getItem('brandguard-brand') ?? '')
  const [status, setStatus] = useState('active')
  const [items, setItems] = useState([])
  const [query, setQuery] = useState('')
  const [state, setState] = useState('loading')
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const [editing, setEditing] = useState(null)
  const [formError, setFormError] = useState('')
  const [rejecting, setRejecting] = useState(null)
  const [rejectNote, setRejectNote] = useState('')
  const [logOpen, setLogOpen] = useState(false)
  const [log, setLog] = useState([])
  const [testText, setTestText] = useState('')
  const [testMatches, setTestMatches] = useState(null)
  const [testError, setTestError] = useState('')
  const [setup, setSetup] = useState(null)
  const [setupError, setSetupError] = useState('')
  const [importOpen, setImportOpen] = useState(false)
  const [runs, setRuns] = useState([])
  const [runFilter, setRunFilter] = useState('')
  const [typeFilter, setTypeFilter] = useState('')
  const [selectedIds, setSelectedIds] = useState([])
  const [bulkReject, setBulkReject] = useState(false)
  const [bulkNote, setBulkNote] = useState('')
  const [bulkResults, setBulkResults] = useState([])
  const [form, setForm] = useState({ code: '', title: '', description: '', category: 'tone', type: 'banned_term', values: '', trigger: '', pattern: '', severity: 'medium', suggestion: '', replacement: '', statement: '', keywords: '', value: '', unit: '', sourceName: '', sourceUrl: '', verifiedAt: new Date().toISOString().slice(0, 10), sourceExcerpt: '', sourceDocument: '' })

  async function loadBrands() {
    const list = await api.getBrands(); setBrands(list)
    const saved = list.find((brand) => String(brand._id) === window.localStorage.getItem('brandguard-brand'))
    const initial = saved ?? list.find((brand) => brand.isDefault) ?? list[0]
    if (initial) setBrandId(String(initial._id))
  }
  async function loadItems() {
    setState('loading'); setError('')
    try { setItems(isRule ? await api.getRules({ brand: brandId, status }) : await api.getFacts({ brand: brandId, status })); setState('success') }
    catch (requestError) { setError(requestError.message); setState('error') }
  }
  async function loadSetup() {
    if (!brandId) return
    try { setSetup(await api.getSetupStatus(brandId)); setSetupError('') }
    catch (requestError) { setSetupError(requestError.message) }
  }
  async function loadRuns() {
    if (!brandId) return
    try { const result = await api.getIngestionRuns(brandId); setRuns(result.runs ?? []) } catch { setRuns([]) }
  }
  useEffect(() => {
    loadBrands().then(() => {
      if (location.state?.brandId) setBrandId(String(location.state.brandId))
      if (location.state?.openSetup) setSetupExpanded(true)
    }).catch((requestError) => { setError(requestError.message); setState('error') })
  }, [])
  const [setupExpanded, setSetupExpanded] = useState(Boolean(location.state?.openSetup))
  useEffect(() => { if (brandId) { window.localStorage.setItem('brandguard-brand', brandId); loadItems(); loadSetup(); loadRuns() } }, [brandId, status])
  useEffect(() => { setSelectedIds([]) }, [brandId, status, runFilter, typeFilter])
  const selectedBrand = brands.find((brand) => String(brand._id) === String(brandId))
  const visible = useMemo(() => items.filter((item) =>
    `${item.code} ${item.title ?? item.statement} ${item.description ?? item.category}`.toLocaleLowerCase().includes(query.toLocaleLowerCase())
    && (!runFilter || String(item.ingestionRun) === runFilter)
    && (!typeFilter || item.type === typeFilter)), [items, query, runFilter, typeFilter])
  const mayEdit = (item) => user.role === 'approver' || item.status === 'draft' && String(item.createdBy?._id ?? item.createdBy) === String(user._id ?? user.id)

  function openForm(item = null) {
    setFormError(''); setTestMatches(null); setTestError('')
    if (!item) { setEditing({ _id: null }); setForm((current) => ({ ...current, code: '', title: '', description: '', category: 'tone', type: 'banned_term', values: '', trigger: '', pattern: '', severity: 'medium', suggestion: '', replacement: '', statement: '', keywords: '', value: '', unit: '', sourceName: '', sourceUrl: '', verifiedAt: new Date().toISOString().slice(0, 10), sourceExcerpt: '', sourceDocument: '' })); return }
    setEditing(item)
    setForm({ ...form, ...item, values: (item.values ?? []).join(', '), keywords: (item.keywords ?? []).join(', '), sourceName: item.source?.name ?? '', sourceUrl: item.source?.url ?? '', verifiedAt: item.verifiedAt ? new Date(item.verifiedAt).toISOString().slice(0, 10) : '', value: item.value ?? '' })
  }
  async function suggestCode() {
    try { const prefix = isRule ? 'TERM' : 'FACT'; const result = await api.getNextRuleCode(prefix, brandId); setForm((current) => ({ ...current, code: result.code })) }
    catch (requestError) { setFormError(requestError.message) }
  }
  function payload() {
    const common = { brand: brandId, code: form.code, category: form.category, sourceExcerpt: form.sourceExcerpt || undefined, sourceDocument: form.sourceDocument || undefined }
    return isRule ? { ...common, title: form.title, description: form.description, type: form.type, values: form.values.split(',').map((v) => v.trim()).filter(Boolean), trigger: form.trigger || undefined, pattern: form.pattern || undefined, severity: form.severity, suggestion: form.suggestion, replacement: form.replacement || undefined }
      : { ...common, statement: form.statement, keywords: form.keywords.split(',').map((v) => v.trim()).filter(Boolean), value: form.value === '' ? undefined : Number(form.value), unit: form.unit || undefined, source: { name: form.sourceName, url: form.sourceUrl }, verifiedAt: form.verifiedAt }
  }
  async function save(event) {
    event.preventDefault(); setFormError('')
    try { const data = payload(); editing?._id ? await (isRule ? api.updateRule(editing._id, data) : api.updateFact(editing._id, data)) : await (isRule ? api.createRule(data) : api.createFact(data)); setEditing(null); setNotice(editing?._id ? 'Draft updated.' : 'Proposal saved as a draft.'); await loadItems(); await loadBrands() }
    catch (requestError) { setFormError(requestError.message) }
  }
  async function act(item, action, data = {}) {
    try { await (isRule ? api.ruleAction(item._id, action, data) : api.factAction(item._id, action, data)); setNotice(`${isRule ? 'Rule' : 'Fact'} ${action === 'unarchive' ? 'restored' : `${action}d`}.`); setRejecting(null); setRejectNote(''); await loadItems(); await loadBrands() }
    catch (requestError) { setError(requestError.message) }
  }
  async function openLog() { setLogOpen(true); try { setLog(await api.getLibraryLog(brandId)) } catch (requestError) { setError(requestError.message) } }
  async function testRule() {
    setTestError(''); setTestMatches(null)
    try { const result = await api.testRule(payload(), testText); setTestMatches(result.matches) }
    catch (requestError) { setTestError(requestError.message) }
  }
  function onSaved() { loadItems(); loadBrands(); loadSetup(); loadRuns() }
  function onImported(imported) {
    setImportOpen(false)
    onSaved()
    setStatus('draft'); setRunFilter(String(imported.run?._id ?? ''))
  }
  async function performBulk(action, note = '') {
    const result = await (isRule ? api.bulkRules(action, selectedIds, note) : api.bulkFacts(action, selectedIds, note))
    setBulkResults(result.results ?? [])
    const succeeded = (result.results ?? []).filter((item) => item.ok).length
    setNotice(`${succeeded} item${succeeded === 1 ? '' : 's'} ${action === 'approve' ? 'approved' : 'rejected'}; review the per-item results below.`)
    setSelectedIds([]); setBulkReject(false); setBulkNote('')
    await Promise.all([loadItems(), loadBrands(), loadSetup()])
  }
  function excerptWithHighlights(item) {
    const excerpt = item.sourceExcerpt ?? ''
    const words = isRule ? item.values ?? [] : item.keywords ?? []
    if (!excerpt || !words.length) return excerpt
    const regex = new RegExp(`(${words.filter(Boolean).sort((a, b) => b.length - a.length).map((word) => word.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|')})`, 'gi')
    return excerpt.split(regex).map((part, index) => words.some((word) => word && part.toLocaleLowerCase() === word.toLocaleLowerCase()) ? <mark key={index}>{part}</mark> : part)
  }

  return <section>
    <div className="page-heading-row"><div><p className="eyebrow">Brand library</p><h1>{isRule ? 'Rules' : 'Verified facts'}</h1><p>{isRule ? 'Propose rules and manage approved brand guidance.' : 'Propose and manage evidence-backed claims.'}</p></div><div className="library-page-actions"><label className="library-search"><Search size={15} /><input aria-label={`Search ${kind}s`} onChange={(event) => setQuery(event.target.value)} placeholder="Search library..." value={query} /></label><button className="button-secondary" disabled={!brandId} onClick={() => setImportOpen(true)} type="button">Import guidelines</button><button className="button-secondary" disabled={!brandId} onClick={openLog} type="button"><FileClock size={14} /> Change log</button><button className="button-primary" disabled={!brandId} onClick={() => openForm()} type="button"><Plus size={14} /> Add {kind}</button></div></div>
    <div className="library-brand-toolbar"><label className="field-label" htmlFor={`${kind}-brand`}>Brand</label><select className="text-input single-line" id={`${kind}-brand`} onChange={(event) => setBrandId(event.target.value)} value={brandId}>{brands.map((brand) => <option key={brand._id} value={brand._id}>{brand.name}</option>)}</select></div>
    {isRule && setup && <section aria-label="Brand setup checklist" className="brand-setup-card"><div className="brand-setup-heading"><div><p className="eyebrow">New brand setup</p><h2>Set up {selectedBrand?.name}</h2></div><button className="text-link-button" onClick={() => setSetupExpanded((open) => !open)} type="button">{setupExpanded ? 'Hide steps' : 'Show steps'}</button></div>{setupExpanded && <><ol className="brand-setup-steps">{setup.steps.map((step, index) => <li className={`setup-step setup-${step.status}`} key={step.id}><span className="setup-number">{step.status === 'done' ? '✓' : index + 1}</span><strong>{step.title}</strong><span>{step.status === 'done' ? 'Done' : step.status === 'current' ? 'Next' : 'To do'}</span></li>)}</ol><div className="setup-actions">{!setup.guidelineImported && <button className="button-primary" onClick={() => setImportOpen(true)} type="button">Import guidelines</button>}{setup.draftCount > 0 && <button className="button-secondary" onClick={() => { setStatus('draft'); setRunFilter('') }} type="button">Review {setup.draftCount} drafts</button>}{setup.guidelineImported && setup.activeRules + setup.activeFacts === 0 && <p>Approve suggested rules and facts to activate brand checks.</p>}{setup.activeRules + setup.activeFacts > 0 && setup.reviewsCount === 0 && <button className="button-primary" onClick={() => navigate('/')} type="button">Run first review</button>}{setupError && <p className="inline-warning" role="alert">{setupError}</p>}</div></>}</section>}
    {status === 'draft' && <div className="draft-filters"><label className="field-label" htmlFor="ingestion-run-filter">Import run</label><select className="text-input single-line" id="ingestion-run-filter" onChange={(event) => setRunFilter(event.target.value)} value={runFilter}><option value="">All drafts</option>{runs.map((run) => <option key={run._id} value={run._id}>{run.filename} · {new Date(run.createdAt).toLocaleDateString()}</option>)}</select>{isRule && <><label className="field-label" htmlFor="draft-type-filter">Type</label><select className="text-input single-line" id="draft-type-filter" onChange={(event) => setTypeFilter(event.target.value)} value={typeFilter}><option value="">All types</option><option value="banned_term">Banned term</option><option value="required_phrase">Required phrase</option><option value="regex_pattern">Regex pattern</option></select></>}</div>}
    <div aria-label="Library status" className="library-status-tabs" role="tablist">{statusTabs.map((value) => <button aria-selected={status === value} className={status === value ? 'review-mode-tab active' : 'review-mode-tab'} key={value} onClick={() => setStatus(value)} role="tab" type="button">{labels[value]}{value === 'draft' && selectedBrand?.counts?.draftItems > 0 ? ` (${selectedBrand.counts.draftItems})` : ''}</button>)}</div>
    {notice && <p className="inline-success" role="status">{notice}</p>}{error && <div className="inline-error" role="alert"><div><strong>Library could not be loaded</strong><p>{error}</p></div><button className="button-secondary" onClick={loadItems} type="button">Retry</button></div>}
    {status === 'draft' && user.role === 'approver' && visible.length > 0 && <div className="bulk-review-toolbar"><label><input aria-label="Select all visible drafts" checked={visible.length > 0 && visible.every((item) => selectedIds.includes(item._id))} onChange={(event) => setSelectedIds(event.target.checked ? visible.map((item) => item._id) : [])} type="checkbox" /> Select all</label><span>{selectedIds.length} selected</span><button className="button-success button-small" disabled={!selectedIds.length} onClick={() => performBulk('approve').catch((error) => setError(error.message))} type="button">Bulk approve</button><button className="button-secondary button-small" disabled={!selectedIds.length} onClick={() => setBulkReject(true)} type="button">Bulk reject</button></div>}
    {bulkResults.length > 0 && <div className="bulk-result-list" role="status"><strong>Bulk action results</strong>{bulkResults.map((item) => <p key={item.id}>{item.id}: {item.ok ? 'completed' : item.error}</p>)}</div>}
    {state === 'loading' && <LoadingState label="Loading brand library..." />}
    {state === 'success' && !visible.length && <div className="friendly-empty"><strong>{query ? 'No matching items' : `No ${labels[status].toLowerCase()} ${kind}s for ${selectedBrand?.name ?? 'this brand'}`}</strong><p>{status === 'active' ? 'Reviews on this brand will only run generic quality checks until library items are approved.' : 'New proposals can be added with the button above.'}</p></div>}
    {state === 'success' && visible.length > 0 && <div className="library-grid">{visible.map((item) => <article className="library-card" key={item._id}>
      {status === 'draft' && user.role === 'approver' && <label className="draft-select"><input aria-label={`Select ${item.code}`} checked={selectedIds.includes(item._id)} onChange={(event) => setSelectedIds((current) => event.target.checked ? [...current, item._id] : current.filter((id) => id !== item._id))} type="checkbox" /> Select draft</label>}
      <div className="library-card-top"><Pill tone="neutral">{item.code}</Pill><Pill tone={item.severity ?? 'neutral'}>{item.severity ?? item.status}</Pill><Pill tone={item.status === 'active' ? 'success' : 'neutral'}>{item.status}</Pill><Pill tone="neutral">{(item.origin ?? 'manual').replace('_', ' ').toUpperCase()}</Pill></div>
      <h2>{item.title ?? item.statement}</h2><p>{item.description ?? item.category}</p><footer><Pill tone="neutral">{item.category}</Pill><Pill tone="neutral">By {item.createdBy?.name ?? 'Seeded library'}</Pill></footer>
      {item.sourceExcerpt && <blockquote>{excerptWithHighlights(item)}</blockquote>}{item.sourceDocument && <p className="source-document-label">From {item.sourceDocument}</p>}{item.source?.url && <a href={item.source.url} target="_blank" rel="noreferrer">{item.source.name} <ExternalLink size={13} /></a>}
      {rejecting?._id === item._id && <div className="library-reject-form"><label className="field-label" htmlFor="reject-note">Reason for rejection</label><textarea id="reject-note" className="text-input" maxLength={300} value={rejectNote} onChange={(event) => setRejectNote(event.target.value)} /><button className="button-secondary" disabled={!rejectNote.trim()} onClick={() => act(item, 'reject', { note: rejectNote })} type="button">Confirm rejection</button><button className="text-link-button" onClick={() => setRejecting(null)} type="button">Cancel</button></div>}
      <div className="library-card-actions">{user.role === 'approver' && item.status === 'draft' && <button className="button-secondary button-small" onClick={() => openForm(item)} type="button">Edit</button>}{user.role === 'approver' && item.status === 'draft' && <><button className="button-success button-small" onClick={() => act(item, 'approve')} type="button">Approve</button><button className="button-secondary button-small" onClick={() => { setRejecting(item); setRejectNote('') }} type="button">Reject</button></>}{user.role === 'approver' && item.status === 'active' && <button className="button-secondary button-small" onClick={() => act(item, 'archive')} type="button">Archive</button>}{user.role === 'approver' && item.status === 'archived' && <button className="button-secondary button-small" onClick={() => act(item, 'unarchive')} type="button">Restore</button>}</div>
    </article>)}</div>}
    {editing && <div className="modal-backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget) setEditing(null) }}><section aria-modal="true" aria-labelledby="library-form-title" className="new-review-modal library-edit-modal" role="dialog"><div className="modal-header"><div><p className="eyebrow">{editing._id ? 'Edit draft' : 'New proposal'}</p><h2 id="library-form-title">{isRule ? 'Rule' : 'Fact'} for {selectedBrand?.name}</h2></div><button className="icon-button" aria-label="Close form" onClick={() => setEditing(null)} type="button">×</button></div>
      <form className="library-form" onSubmit={save}><label className="field-label" htmlFor="lib-code">Code</label><div className="library-code-row"><input id="lib-code" className="text-input" pattern="[A-Z]{2,8}-[0-9]{1,3}" required maxLength={12} value={form.code} onChange={(event) => setForm({ ...form, code: event.target.value.toUpperCase() })} /><button className="button-secondary button-small" onClick={suggestCode} type="button">Suggest code</button></div>
      {isRule ? <>
        <label className="field-label" htmlFor="lib-title">Title</label><input id="lib-title" className="text-input" required maxLength={120} value={form.title} onChange={(event) => setForm({ ...form, title: event.target.value })} />
        <label className="field-label" htmlFor="lib-description">Description</label><textarea id="lib-description" className="text-input" required maxLength={1000} value={form.description} onChange={(event) => setForm({ ...form, description: event.target.value })} />
        <label className="field-label" htmlFor="lib-rule-type">Rule type</label><select id="lib-rule-type" className="text-input" value={form.type} onChange={(event) => setForm({ ...form, type: event.target.value })}><option value="banned_term">Banned term</option><option value="required_phrase">Required phrase</option><option value="regex_pattern">Regex pattern</option></select>
        {form.type === 'regex_pattern' ? <><label className="field-label" htmlFor="lib-pattern">Pattern</label><input id="lib-pattern" className="text-input" maxLength={200} required value={form.pattern} onChange={(event) => setForm({ ...form, pattern: event.target.value })} /></> : <><label className="field-label" htmlFor="lib-values">Values (comma separated)</label><input id="lib-values" className="text-input" required value={form.values} onChange={(event) => setForm({ ...form, values: event.target.value })} /></>}
        {form.type === 'required_phrase' && <><label className="field-label" htmlFor="lib-trigger">Trigger regex</label><input id="lib-trigger" className="text-input" required value={form.trigger} onChange={(event) => setForm({ ...form, trigger: event.target.value })} /></>}
        <label className="field-label" htmlFor="lib-sample">Regex tester sample</label><textarea id="lib-sample" className="text-input" value={testText} onChange={(event) => setTestText(event.target.value)} /><button className="button-secondary button-small" disabled={!testText} onClick={testRule} type="button">Test rule</button>{testError && <p className="inline-warning" role="alert">{testError}</p>}{testMatches && <p role="status">{testMatches.length ? `Matched ${testMatches.length} time(s).` : 'No matches.'}</p>}
        <label className="field-label" htmlFor="lib-suggestion">Suggestion</label><textarea id="lib-suggestion" className="text-input" required maxLength={500} value={form.suggestion} onChange={(event) => setForm({ ...form, suggestion: event.target.value })} />
      </> : <>
        <label className="field-label" htmlFor="lib-statement">Fact statement</label><textarea id="lib-statement" className="text-input" required maxLength={1000} value={form.statement} onChange={(event) => setForm({ ...form, statement: event.target.value })} />
        <label className="field-label" htmlFor="lib-keywords">Keywords (comma separated)</label><input id="lib-keywords" className="text-input" required value={form.keywords} onChange={(event) => setForm({ ...form, keywords: event.target.value })} />
        <label className="field-label" htmlFor="lib-source-name">Source name</label><input id="lib-source-name" className="text-input" required value={form.sourceName} onChange={(event) => setForm({ ...form, sourceName: event.target.value })} />
        <label className="field-label" htmlFor="lib-source-url">Source URL</label><input id="lib-source-url" className="text-input" type="url" required value={form.sourceUrl} onChange={(event) => setForm({ ...form, sourceUrl: event.target.value })} />
        <label className="field-label" htmlFor="lib-verified-at">Verified at</label><input id="lib-verified-at" className="text-input" type="date" required value={form.verifiedAt} onChange={(event) => setForm({ ...form, verifiedAt: event.target.value })} />
      </>}
      <label className="field-label" htmlFor="lib-category">Category</label>{isRule ? <select id="lib-category" className="text-input" required value={form.category} onChange={(event) => setForm({ ...form, category: event.target.value })}><option value="tone">Tone</option><option value="terminology">Terminology</option><option value="legal">Legal</option><option value="claims">Claims</option><option value="formatting">Formatting</option></select> : <input id="lib-category" className="text-input" required maxLength={80} value={form.category} onChange={(event) => setForm({ ...form, category: event.target.value })} />}
      {isRule && <><label className="field-label" htmlFor="lib-severity">Severity</label><select id="lib-severity" className="text-input" value={form.severity} onChange={(event) => setForm({ ...form, severity: event.target.value })}><option>high</option><option>medium</option><option>low</option></select></>}
      <label className="field-label" htmlFor="lib-excerpt">Source excerpt (optional)</label><textarea id="lib-excerpt" className="text-input" maxLength={500} value={form.sourceExcerpt} onChange={(event) => setForm({ ...form, sourceExcerpt: event.target.value })} />
      {formError && <p className="inline-warning" role="alert">{formError}</p>}<div className="input-actions"><button className="button-secondary" onClick={() => setEditing(null)} type="button">Cancel</button><button className="button-primary" type="submit">Save draft</button></div></form>
    </section></div>}
    {logOpen && <div className="modal-backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget) setLogOpen(false) }}><section aria-modal="true" aria-labelledby="library-log-title" className="new-review-modal library-log-modal" role="dialog"><div className="modal-header"><div><p className="eyebrow">{selectedBrand?.name}</p><h2 id="library-log-title">Library change log</h2></div><button className="icon-button" aria-label="Close change log" onClick={() => setLogOpen(false)} type="button">×</button></div>{log.length ? log.map((entry) => <article className="library-log-entry" key={entry._id}><strong>{entry.action} · {entry.code ?? 'Brand'}</strong><span>{entry.actorName} ({entry.actorRole}) · {new Date(entry.createdAt).toLocaleString()}</span>{entry.changedFields?.length > 0 && <small>Changed: {entry.changedFields.join(', ')}</small>}{entry.note && <p>{entry.note}</p>}</article>) : <p>No library changes recorded yet.</p>}</section></div>}
    {bulkReject && <div className="modal-backdrop"><section aria-labelledby="bulk-reject-title" aria-modal="true" className="new-review-modal library-edit-modal" role="dialog"><h2 id="bulk-reject-title">Reject selected drafts</h2><p>A rejection note is saved in each selected item's change history.</p><label className="field-label" htmlFor="bulk-reject-note">Required note</label><textarea className="text-input" id="bulk-reject-note" maxLength={300} onChange={(event) => setBulkNote(event.target.value)} value={bulkNote} /><div className="input-actions"><button className="button-secondary" onClick={() => setBulkReject(false)} type="button">Cancel</button><button className="button-primary" disabled={!bulkNote.trim()} onClick={() => performBulk('reject', bulkNote).catch((error) => setError(error.message))} type="button">Reject drafts</button></div></section></div>}
    {importOpen && <GuidelineImportModal brandId={brandId} brandName={selectedBrand?.name ?? ''} onClose={() => setImportOpen(false)} onSaved={onSaved} onImported={onImported} />}
  </section>
}

export default LibraryPage
