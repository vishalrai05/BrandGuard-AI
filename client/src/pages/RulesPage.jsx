import { useEffect, useState } from 'react'
import { Search } from 'lucide-react'
import { api } from '../api/client.js'
import LoadingState from '../components/LoadingState.jsx'
import Pill from '../components/Pill.jsx'

function RulesPage() {
  const [rules, setRules] = useState([])
  const [query, setQuery] = useState('')
  const [state, setState] = useState('loading')
  const [error, setError] = useState('')
  const [slow, setSlow] = useState(false)

  async function loadRules() {
    setState('loading')
    setError('')
    try {
      setRules(await api.getRules({ onSlow: () => setSlow(true), onSlowComplete: () => setSlow(false) }))
      setState('success')
    } catch (requestError) {
      setError(requestError.message)
      setState('error')
    }
  }

  useEffect(() => { loadRules() }, [])
  const visible = rules.filter((rule) => `${rule.code} ${rule.title} ${rule.description} ${rule.category}`.toLowerCase().includes(query.toLowerCase()))

  return (
    <section>
      <div className="page-heading-row">
        <div><p className="eyebrow">Brand library</p><h1>Rules</h1><p>Approved language, tone, and compliance guidance.</p></div>
        <label className="library-search"><Search size={15} /><input aria-label="Search rules" onChange={(event) => setQuery(event.target.value)} placeholder="Search rules..." value={query} /></label>
      </div>
      {slow && <p className="waking-message" role="status">Waking up the server, this can take up to a minute</p>}
      {state === 'loading' && <LoadingState label={slow ? 'Waking up the server, this can take up to a minute' : 'Loading approved rules...'} />}
      {state === 'error' && <div className="inline-error" role="alert"><div><strong>Rules could not be loaded</strong><p>{error}</p></div><button className="button-secondary" onClick={loadRules} type="button">Retry</button></div>}
      {state === 'success' && visible.length === 0 && <div className="friendly-empty"><strong>No matching rules</strong><p>Try another search, or check back when the library is updated.</p></div>}
      {state === 'success' && visible.length > 0 && <div className="library-grid">{visible.map((rule) => (
        <article className="library-card" key={rule._id}>
          <div className="library-card-top"><Pill tone="neutral">{rule.code}</Pill><Pill tone={rule.severity}>{rule.severity}</Pill></div>
          <h2>{rule.title}</h2><p>{rule.description}</p>
          <footer><Pill tone="neutral">{rule.category}</Pill><Pill tone="neutral">{rule.type.replaceAll('_', ' ')}</Pill></footer>
        </article>
      ))}</div>}
    </section>
  )
}

export default RulesPage
