import { useEffect, useState } from 'react'
import { ExternalLink, Search } from 'lucide-react'
import { api } from '../api/client.js'
import LoadingState from '../components/LoadingState.jsx'
import Pill from '../components/Pill.jsx'

function FactsPage() {
  const [facts, setFacts] = useState([])
  const [query, setQuery] = useState('')
  const [state, setState] = useState('loading')
  const [error, setError] = useState('')
  const [slow, setSlow] = useState(false)

  async function loadFacts() {
    setState('loading')
    setError('')
    try {
      setFacts(await api.getFacts({ onSlow: () => setSlow(true), onSlowComplete: () => setSlow(false) }))
      setState('success')
    } catch (requestError) {
      setError(requestError.message)
      setState('error')
    }
  }

  useEffect(() => { loadFacts() }, [])
  const visible = facts.filter((fact) => `${fact.code} ${fact.statement} ${fact.category} ${fact.source?.name}`.toLowerCase().includes(query.toLowerCase()))

  return (
    <section>
      <div className="page-heading-row">
        <div><p className="eyebrow">Brand library</p><h1>Verified facts</h1><p>Evidence-backed claims approved for use in brand communications.</p></div>
        <label className="library-search"><Search size={15} /><input aria-label="Search facts" onChange={(event) => setQuery(event.target.value)} placeholder="Search facts..." value={query} /></label>
      </div>
      {slow && <p className="waking-message" role="status">Waking up the server, this can take up to a minute</p>}
      {state === 'loading' && <LoadingState label={slow ? 'Waking up the server, this can take up to a minute' : 'Loading verified facts...'} />}
      {state === 'error' && <div className="inline-error" role="alert"><div><strong>Facts could not be loaded</strong><p>{error}</p></div><button className="button-secondary" onClick={loadFacts} type="button">Retry</button></div>}
      {state === 'success' && visible.length === 0 && <div className="friendly-empty"><strong>No matching facts</strong><p>Try another search, or check back when the library is updated.</p></div>}
      {state === 'success' && visible.length > 0 && <div className="library-grid">{visible.map((fact) => (
        <article className="library-card" key={fact._id}>
          <div className="library-card-top"><Pill tone="neutral">{fact.code}</Pill><Pill tone="success">Verified</Pill></div>
          <h2>{fact.statement}</h2>
          <footer><Pill tone="neutral">{fact.category}</Pill>{fact.verifiedAt && <Pill tone="neutral">Verified {new Date(fact.verifiedAt).toLocaleDateString()}</Pill>}</footer>
          {fact.source?.url
            ? <a href={fact.source.url} rel="noreferrer" target="_blank">{fact.source.name} <ExternalLink size={13} /></a>
            : <p>Source: {fact.source?.name ?? 'Not listed'}</p>}
        </article>
      ))}</div>}
    </section>
  )
}

export default FactsPage
