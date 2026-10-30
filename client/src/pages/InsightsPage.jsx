import { useEffect, useMemo, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { Activity, ArrowDownWideNarrow, BarChart3, BookOpenText, Clock3, Eye, EyeOff, Lightbulb, RotateCw, ShieldAlert, Sparkles } from 'lucide-react'
import { api } from '../api/client.js'

const PERIODS = [7, 30, 90, 365]
const CATEGORY_ORDER = ['claims', 'tone', 'terminology', 'legal', 'formatting', 'readability', 'accessibility', 'uncategorized']
const DAY_IN_MS = 86_400_000

function filterValues(params) {
  const parsedDays = Number(params.get('days') ?? 30)
  return {
    days: PERIODS.includes(parsedDays) ? parsedDays : 30,
    scope: ['all', 'mine'].includes(params.get('scope')) ? params.get('scope') : 'all',
    brand: params.get('brand') ?? '',
  }
}

function friendlyError(error) {
  if (error?.status === 401) return 'Your session expired. Sign in again to view insights.'
  if (error?.status === 400) return 'Those filters could not be applied. Check the selections and retry.'
  return 'Insights could not be loaded. Check your connection and try again.'
}

function formatDate(value, options = { month: 'short', day: 'numeric', year: 'numeric' }) {
  const date = new Date(value)
  return Number.isFinite(date.getTime()) ? date.toLocaleDateString(undefined, options) : 'Unknown date'
}

function relativeDate(value) {
  const date = new Date(value)
  if (!Number.isFinite(date.getTime())) return 'Unknown'
  const days = Math.round((date.getTime() - Date.now()) / DAY_IN_MS)
  if (Math.abs(days) < 1) return 'Today'
  return new Intl.RelativeTimeFormat(undefined, { numeric: 'auto' }).format(days, 'day')
}

function formatCount(value) {
  return Number.isFinite(value) ? value.toLocaleString() : '0'
}

function formatRate(value) {
  return value === null || !Number.isFinite(value) ? 'No decisions yet' : `${Math.round(value * 100)}%`
}

function useInsightsData(filters, retryKey) {
  const [state, setState] = useState('loading')
  const [error, setError] = useState('')
  const [insights, setInsights] = useState(null)
  const [brands, setBrands] = useState([])

  useEffect(() => {
    let active = true
    setState('loading')
    setError('')
    Promise.all([
      api.getInsights({ ...filters, brand: filters.brand || undefined }),
      api.getInsightBrands(),
    ]).then(([nextInsights, nextBrands]) => {
      if (!active) return
      setInsights(nextInsights)
      setBrands(nextBrands)
      setState('success')
    }).catch((requestError) => {
      if (!active) return
      setError(friendlyError(requestError))
      setState('error')
    })
    return () => { active = false }
  }, [filters.days, filters.scope, filters.brand, retryKey])

  return { state, error, insights, brands }
}

function SummaryCards({ totals, workflow }) {
  const cards = [
    { label: 'Reviews analysed', value: totals.reviews, icon: BookOpenText },
    { label: 'Total findings', value: totals.findings, icon: Activity },
    { label: 'High severity', value: totals.bySeverity.high, icon: ShieldAlert, tone: 'high' },
    { label: 'Acceptance rate', value: formatRate(totals.acceptanceRate), icon: Sparkles },
    { label: 'Avg. hours to decision', value: workflow.avgHoursToDecision === null ? '—' : workflow.avgHoursToDecision, icon: Clock3 },
  ]
  return (
    <section aria-label="Insights summary" className="insight-summary-grid">
      {cards.map(({ label, value, icon: Icon, tone }) => (
        <article className={`insight-summary-card ${tone ? `insight-summary-${tone}` : ''}`} key={label}>
          <div className="insight-summary-label"><Icon aria-hidden="true" size={15} /><span>{label}</span></div>
          <strong>{typeof value === 'number' ? formatCount(value) : value}</strong>
        </article>
      ))}
    </section>
  )
}

function FilterBar({ filters, brands, onChange }) {
  return (
    <section aria-label="Insight filters" className="insight-filter-bar">
      <label className="select-control insight-filter">
        <span>Period</span>
        <select aria-label="Insight period" onChange={(event) => onChange('days', Number(event.target.value))} value={filters.days}>
          {PERIODS.map((days) => <option key={days} value={days}>{days} days</option>)}
        </select>
      </label>
      <label className="select-control insight-filter">
        <span>Scope</span>
        <select aria-label="Review scope" onChange={(event) => onChange('scope', event.target.value)} value={filters.scope}>
          <option value="all">All reviews</option><option value="mine">My reviews</option>
        </select>
      </label>
      <label className="select-control insight-filter insight-brand-filter">
        <span>Brand</span>
        <select aria-label="Filter by brand" onChange={(event) => onChange('brand', event.target.value)} value={filters.brand}>
          <option value="">All brands</option>
          {brands.map((brand) => <option key={brand.brandName} value={brand.brandName}>{brand.brandName} ({brand.count})</option>)}
        </select>
      </label>
    </section>
  )
}

function TopIssues({ issues, truncated }) {
  const maximum = issues[0]?.count ?? 1
  return (
    <section aria-labelledby="top-issues-title" className="insight-panel top-issues-panel">
      <div className="insight-panel-heading">
        <div><p className="eyebrow">Pattern watch</p><h2 id="top-issues-title">Top 5 repeated mistakes</h2><p>Repeated finding codes are ranked by frequency, then by the most recent occurrence.</p></div>
        <Lightbulb aria-hidden="true" className="panel-heading-icon" size={21} />
      </div>
      {truncated && <p className="insight-truncated" role="status">Only the most recent 2,000 reviews were analysed.</p>}
      {issues.length === 0 ? <p className="insight-muted">No recurring issues were found in this period.</p> : (
        <ol className="top-issue-list">
          {issues.map((issue, index) => (
            <li aria-label={`Rank ${index + 1}: ${issue.title}, ${issue.count} findings, ${issue.severity} severity`} className="top-issue-row" key={issue.key} tabIndex={0}>
              <span aria-label={`Rank ${index + 1}`} className="issue-rank">{String(index + 1).padStart(2, '0')}</span>
              <div className="top-issue-body">
                <div className="top-issue-title-row">
                  <h3>{issue.title}</h3>
                  <code className="issue-code">{issue.key}</code>
                  <span className="issue-category">{issue.category}</span>
                </div>
                <div aria-label={`${issue.count} findings`} className="issue-count-track" role="img">
                  <span className="issue-count-bar" style={{ width: `${Math.max((issue.count / maximum) * 100, 2)}%` }} />
                  <strong>{issue.count}</strong>
                </div>
                <div className="issue-meta-line">
                  <span className={`issue-severity severity-label-${issue.severity}`}>{issue.severity} severity</span>
                  <span>Accepted {issue.accepted}</span><span>Dismissed {issue.dismissed}</span><span>Open {issue.open}</span>
                  <time dateTime={issue.lastSeen} title={formatDate(issue.lastSeen)}>Last seen {relativeDate(issue.lastSeen)}</time>
                </div>
                {issue.exampleText && <blockquote className="issue-example">“{issue.exampleText}”</blockquote>}
              </div>
            </li>
          ))}
        </ol>
      )}
    </section>
  )
}

function DataTableToggle({ showTable, onToggle }) {
  return (
    <button aria-pressed={showTable} className="button-secondary button-small chart-view-toggle" onClick={onToggle} type="button">
      {showTable ? <><EyeOff aria-hidden="true" size={14} /> View chart</> : <><Eye aria-hidden="true" size={14} /> View as table</>}
    </button>
  )
}

function CategoryBreakdown({ categories }) {
  const [showTable, setShowTable] = useState(false)
  const rows = useMemo(() => {
    const byName = new Map(categories.map((entry) => [entry.category, entry]))
    return CATEGORY_ORDER.map((category) => byName.get(category) ?? { category, count: 0, high: 0, medium: 0, low: 0 })
  }, [categories])
  const max = Math.max(1, ...rows.map((entry) => entry.count))
  return (
    <section aria-labelledby="category-breakdown-title" className="insight-panel">
      <div className="insight-panel-heading compact-heading">
        <div><p className="eyebrow">Finding categories</p><h2 id="category-breakdown-title">Category breakdown</h2><p>Severity totals appear as labelled segments; bar lengths compare category volume.</p></div>
        <DataTableToggle showTable={showTable} onToggle={() => setShowTable((value) => !value)} />
      </div>
      {showTable ? (
        <div className="insight-table-scroll" tabIndex={0} aria-label="Scrollable category breakdown table">
          <table className="insight-table"><caption>Finding counts by category and severity</caption><thead><tr><th scope="col">Category</th><th scope="col">High</th><th scope="col">Medium</th><th scope="col">Low</th><th scope="col">Total</th></tr></thead>
            <tbody>{rows.map((row) => <tr key={row.category}><th scope="row">{row.category}</th><td>{row.high}</td><td>{row.medium}</td><td>{row.low}</td><td>{row.count}</td></tr>)}</tbody>
          </table>
        </div>
      ) : (
        <figure className="category-chart" aria-label="Stacked horizontal bars for findings by category and severity">
          <div className="category-legend" aria-label="Severity legend"><span><i className="severity-swatch high" />High</span><span><i className="severity-swatch medium" />Medium</span><span><i className="severity-swatch low" />Low</span></div>
          <div className="category-rows" role="list">
            {rows.map((row) => (
              <div className="category-row" key={row.category} role="listitem">
                <span className="category-name">{row.category}</span>
                <div aria-label={`${row.category}: ${row.high} high, ${row.medium} medium, ${row.low} low; ${row.count} total`} className="category-stack" role="img">
                  <span className="category-segment high" style={{ width: `${(row.high / max) * 100}%` }} />
                  <span className="category-segment medium" style={{ width: `${(row.medium / max) * 100}%` }} />
                  <span className="category-segment low" style={{ width: `${(row.low / max) * 100}%` }} />
                </div>
                <span className="category-values">H {row.high} · M {row.medium} · L {row.low}</span>
              </div>
            ))}
          </div>
          <figcaption>Readability and accessibility checks are listed separately from brand-rule categories.</figcaption>
        </figure>
      )}
    </section>
  )
}

function bucketLabel(value, bucket) {
  return formatDate(value, bucket === 'week' ? { month: 'short', day: 'numeric' } : { month: 'short', day: 'numeric' })
}

function FindingsOverTime({ data, bucket }) {
  const [showTable, setShowTable] = useState(false)
  const [activeIndex, setActiveIndex] = useState(null)
  const width = 760
  const height = 260
  const margin = { top: 14, right: 12, bottom: 42, left: 44 }
  const plotWidth = width - margin.left - margin.right
  const plotHeight = height - margin.top - margin.bottom
  const max = Math.max(1, ...data.map((entry) => entry.findings))
  const slot = plotWidth / Math.max(data.length, 1)
  const ticks = [0, Math.ceil(max / 3), Math.ceil((max * 2) / 3), max].filter((value, index, values) => values.indexOf(value) === index)
  const active = activeIndex === null ? null : data[activeIndex]
  return (
    <section aria-labelledby="findings-time-title" className="insight-panel">
      <div className="insight-panel-heading compact-heading">
        <div><p className="eyebrow">Volume over time</p><h2 id="findings-time-title">Findings over time</h2><p>Bars stack high, medium, and low findings per day or week.</p></div>
        <DataTableToggle showTable={showTable} onToggle={() => setShowTable((value) => !value)} />
      </div>
      {showTable ? (
        <div className="insight-table-scroll" tabIndex={0} aria-label="Scrollable findings over time table">
          <table className="insight-table"><caption>Review and finding counts by {bucket}</caption><thead><tr><th scope="col">{bucket === 'week' ? 'Week starting' : 'Date'}</th><th scope="col">Reviews</th><th scope="col">Findings</th><th scope="col">High</th><th scope="col">Medium</th><th scope="col">Low</th></tr></thead>
            <tbody>{data.map((entry) => <tr key={entry.bucketStart}><th scope="row">{bucketLabel(entry.bucketStart, bucket)}</th><td>{entry.reviews}</td><td>{entry.findings}</td><td>{entry.high}</td><td>{entry.medium}</td><td>{entry.low}</td></tr>)}</tbody>
          </table>
        </div>
      ) : (
        <figure className="insight-chart-figure">
          <svg aria-labelledby="findings-chart-svg-title findings-chart-svg-desc" className="insight-svg" role="img" viewBox={`0 0 ${width} ${height}`}>
            <title id="findings-chart-svg-title">Findings by {bucket}</title>
            <desc id="findings-chart-svg-desc">Stacked bars show high, medium, and low findings. Focus or hover a bar for its exact values.</desc>
            {ticks.map((tick) => {
              const y = margin.top + plotHeight - (tick / max) * plotHeight
              return <g key={tick}><line className="chart-gridline" x1={margin.left} x2={width - margin.right} y1={y} y2={y} /><text className="chart-axis-label" textAnchor="end" x={margin.left - 8} y={y + 4}>{tick}</text></g>
            })}
            <line className="chart-axis" x1={margin.left} x2={margin.left} y1={margin.top} y2={margin.top + plotHeight} />
            <line className="chart-axis" x1={margin.left} x2={width - margin.right} y1={margin.top + plotHeight} y2={margin.top + plotHeight} />
            {data.map((entry, index) => {
              const x = margin.left + index * slot + (slot - Math.max(3, slot * 0.62)) / 2
              const barWidth = Math.max(3, slot * 0.62)
              let cursor = margin.top + plotHeight
              const segments = [['low', entry.low], ['medium', entry.medium], ['high', entry.high]]
              return (
                <g
                  aria-label={`${bucketLabel(entry.bucketStart, bucket)}: ${entry.reviews} reviews; ${entry.findings} findings, ${entry.high} high, ${entry.medium} medium, ${entry.low} low`}
                  className={`chart-bar-group ${activeIndex === index ? 'chart-point-active' : ''}`}
                  key={entry.bucketStart}
                  onBlur={() => setActiveIndex(null)}
                  onFocus={() => setActiveIndex(index)}
                  onMouseEnter={() => setActiveIndex(index)}
                  onMouseLeave={() => setActiveIndex(null)}
                  role="img"
                  tabIndex={0}
                >
                  <title>{`${bucketLabel(entry.bucketStart, bucket)} · ${entry.findings} findings · High ${entry.high}, Medium ${entry.medium}, Low ${entry.low}`}</title>
                  <rect className="chart-hit-area" height={plotHeight} width={Math.max(5, slot)} x={margin.left + index * slot} y={margin.top} />
                  {segments.map(([severity, value]) => {
                    const segmentHeight = (value / max) * plotHeight
                    cursor -= segmentHeight
                    return value > 0 ? <rect className={`chart-segment ${severity}`} height={segmentHeight} key={severity} width={barWidth} x={x} y={cursor} /> : null
                  })}
                </g>
              )
            })}
            {data.filter((_entry, index) => index % Math.max(1, Math.ceil(data.length / 7)) === 0 || index === data.length - 1).map((entry) => {
              const index = data.indexOf(entry)
              const x = margin.left + index * slot + slot / 2
              return <text className="chart-axis-label" key={entry.bucketStart} textAnchor="middle" x={x} y={height - 12}>{bucketLabel(entry.bucketStart, bucket)}</text>
            })}
            <text className="chart-axis-title" textAnchor="middle" transform={`translate(13 ${margin.top + plotHeight / 2}) rotate(-90)`}>Findings</text>
          </svg>
          <div aria-live="polite" className="insight-chart-tooltip" role="status">
            {active ? `${bucketLabel(active.bucketStart, bucket)}: ${active.findings} findings (High ${active.high}, Medium ${active.medium}, Low ${active.low}); ${active.reviews} reviews.` : 'Hover or keyboard-focus a bar to inspect its values.'}
          </div>
          <div className="category-legend chart-legend"><span><i className="severity-swatch high" />High</span><span><i className="severity-swatch medium" />Medium</span><span><i className="severity-swatch low" />Low</span></div>
          <figcaption>Text alternative: the table view lists every bucket and its review and severity counts.</figcaption>
        </figure>
      )}
    </section>
  )
}

function ReadabilityTrend({ data, bucket }) {
  const [showTable, setShowTable] = useState(false)
  const [activeIndex, setActiveIndex] = useState(null)
  const width = 760
  const height = 240
  const margin = { top: 16, right: 14, bottom: 40, left: 48 }
  const plotWidth = width - margin.left - margin.right
  const plotHeight = height - margin.top - margin.bottom
  const points = data.map((entry, index) => ({ ...entry, index })).filter((entry) => Number.isFinite(entry.avgGrade))
  const minGrade = points.length ? Math.min(...points.map((point) => point.avgGrade)) : 0
  const maxGrade = points.length ? Math.max(...points.map((point) => point.avgGrade)) : 1
  const padding = minGrade === maxGrade ? 1 : (maxGrade - minGrade) * 0.15
  const min = minGrade - padding
  const max = maxGrade + padding
  const pointAt = (point) => ({
    x: margin.left + (point.index / Math.max(data.length - 1, 1)) * plotWidth,
    y: margin.top + ((max - point.avgGrade) / Math.max(max - min, 0.01)) * plotHeight,
  })
  const path = points.reduce((value, point, index) => {
    const { x, y } = pointAt(point)
    const previous = points[index - 1]
    const startsSegment = !previous || point.index !== previous.index + 1
    return `${value}${startsSegment ? `M ${x} ${y}` : ` L ${x} ${y}`}`
  }, '')
  const active = activeIndex === null ? null : points.find((point) => point.index === activeIndex)
  return (
    <section aria-labelledby="readability-trend-title" className="insight-panel">
      <div className="insight-panel-heading compact-heading">
        <div><p className="eyebrow">Reading level</p><h2 id="readability-trend-title">Readability trend</h2><p>Lower grade levels are generally easier to read. Buckets without metrics are skipped.</p></div>
        <DataTableToggle showTable={showTable} onToggle={() => setShowTable((value) => !value)} />
      </div>
      {showTable ? (
        <div className="insight-table-scroll" tabIndex={0} aria-label="Scrollable readability trend table">
          <table className="insight-table"><caption>Readability averages by {bucket}</caption><thead><tr><th scope="col">{bucket === 'week' ? 'Week starting' : 'Date'}</th><th scope="col">Avg. grade</th><th scope="col">Avg. sentence length</th><th scope="col">Avg. reading ease</th></tr></thead>
            <tbody>{data.map((entry) => <tr key={entry.bucketStart}><th scope="row">{bucketLabel(entry.bucketStart, bucket)}</th><td>{Number.isFinite(entry.avgGrade) ? entry.avgGrade : '—'}</td><td>{Number.isFinite(entry.avgSentenceLength) ? entry.avgSentenceLength : '—'}</td><td>{Number.isFinite(entry.avgReadingEase) ? entry.avgReadingEase : '—'}</td></tr>)}</tbody>
          </table>
        </div>
      ) : points.length === 0 ? (
        <p className="insight-muted trend-empty">No readability metrics are available for this period.</p>
      ) : (
        <figure className="insight-chart-figure">
          <svg aria-labelledby="readability-chart-svg-title readability-chart-svg-desc" className="insight-svg readability-svg" role="img" viewBox={`0 0 ${width} ${height}`}>
            <title id="readability-chart-svg-title">Average Flesch-Kincaid grade by {bucket}</title>
            <desc id="readability-chart-svg-desc">Line points show grade level for buckets with readability data. Lower points represent easier text.</desc>
            {[0, 0.5, 1].map((fraction) => {
              const y = margin.top + fraction * plotHeight
              const value = max - fraction * (max - min)
              return <g key={fraction}><line className="chart-gridline" x1={margin.left} x2={width - margin.right} y1={y} y2={y} /><text className="chart-axis-label" textAnchor="end" x={margin.left - 8} y={y + 4}>{value.toFixed(1)}</text></g>
            })}
            <line className="chart-axis" x1={margin.left} x2={margin.left} y1={margin.top} y2={margin.top + plotHeight} />
            <line className="chart-axis" x1={margin.left} x2={width - margin.right} y1={margin.top + plotHeight} y2={margin.top + plotHeight} />
            <path className="readability-line" d={path} />
            {points.map((point) => {
              const { x, y } = pointAt(point)
              return <circle
                aria-label={`${bucketLabel(point.bucketStart, bucket)}: grade ${point.avgGrade}, average sentence ${point.avgSentenceLength}, reading ease ${point.avgReadingEase}`}
                className={`readability-point ${activeIndex === point.index ? 'chart-point-active' : ''}`}
                cx={x} cy={y} key={point.bucketStart} onBlur={() => setActiveIndex(null)} onFocus={() => setActiveIndex(point.index)} onMouseEnter={() => setActiveIndex(point.index)} onMouseLeave={() => setActiveIndex(null)} r="5" role="img" tabIndex={0}
              ><title>{`${bucketLabel(point.bucketStart, bucket)} · grade ${point.avgGrade}`}</title></circle>
            })}
            {data.filter((_entry, index) => index % Math.max(1, Math.ceil(data.length / 7)) === 0 || index === data.length - 1).map((entry) => {
              const index = data.indexOf(entry)
              const x = margin.left + (index / Math.max(data.length - 1, 1)) * plotWidth
              return <text className="chart-axis-label" key={entry.bucketStart} textAnchor="middle" x={x} y={height - 12}>{bucketLabel(entry.bucketStart, bucket)}</text>
            })}
            <text className="chart-axis-title" textAnchor="middle" transform={`translate(14 ${margin.top + plotHeight / 2}) rotate(-90)`}>Grade level</text>
          </svg>
          <div aria-live="polite" className="insight-chart-tooltip" role="status">
            {active ? `${bucketLabel(active.bucketStart, bucket)}: grade ${active.avgGrade}, average sentence ${active.avgSentenceLength} words, reading ease ${active.avgReadingEase}.` : 'Hover or keyboard-focus a point to inspect its values.'}
          </div>
          <figcaption>Text alternative: the table view lists grade, sentence length, and reading-ease averages for each bucket.</figcaption>
        </figure>
      )}
    </section>
  )
}

function AllIssues({ issues }) {
  const [sortBy, setSortBy] = useState('count')
  const sorted = useMemo(() => [...issues].sort((left, right) => sortBy === 'lastSeen'
    ? new Date(right.lastSeen) - new Date(left.lastSeen) || right.count - left.count
    : right.count - left.count || new Date(right.lastSeen) - new Date(left.lastSeen)), [issues, sortBy])
  return (
    <details className="insight-panel all-issues-panel">
      <summary><span><p className="eyebrow">Full list</p><strong>All issues</strong><small>Up to 25 issue codes</small></span><ArrowDownWideNarrow aria-hidden="true" size={18} /></summary>
      <div className="all-issues-toolbar">
        <label className="select-control insight-filter"><span>Sort by</span><select aria-label="Sort all issues" onChange={(event) => setSortBy(event.target.value)} value={sortBy}><option value="count">Count</option><option value="lastSeen">Last seen</option></select></label>
      </div>
      <div className="insight-table-scroll" tabIndex={0} aria-label="Scrollable all issues table">
        <table className="insight-table"><caption>Recurring findings grouped by code</caption><thead><tr><th scope="col">Issue</th><th scope="col">Category</th><th scope="col">Count</th><th scope="col">Severity</th><th scope="col">Accepted</th><th scope="col">Dismissed</th><th scope="col">Open</th><th scope="col">Last seen</th></tr></thead>
          <tbody>{sorted.map((issue) => <tr key={issue.key}><th scope="row"><span>{issue.title}</span><code>{issue.key}</code></th><td>{issue.category}</td><td>{issue.count}</td><td>{issue.severity}</td><td>{issue.accepted}</td><td>{issue.dismissed}</td><td>{issue.open}</td><td><time dateTime={issue.lastSeen}>{formatDate(issue.lastSeen)}</time></td></tr>)}</tbody>
        </table>
      </div>
    </details>
  )
}

function WorkflowCard({ workflow }) {
  const rows = [
    ['Draft', workflow.draft],
    ['Pending approval', workflow.pending_approval],
    ['Approved', workflow.approved],
    ['Changes requested', workflow.changes_requested],
  ]
  return (
    <section aria-labelledby="workflow-insight-title" className="insight-panel workflow-insights">
      <div className="insight-panel-heading compact-heading"><div><p className="eyebrow">Review lifecycle</p><h2 id="workflow-insight-title">Workflow</h2></div></div>
      <dl className="workflow-insight-grid">{rows.map(([label, value]) => <div key={label}><dt>{label}</dt><dd>{formatCount(value)}</dd></div>)}</dl>
      <p className="workflow-average">Average decision time <strong>{workflow.avgHoursToDecision === null ? '—' : `${workflow.avgHoursToDecision} hours`}</strong></p>
    </section>
  )
}

function LoadingSkeleton() {
  return (
    <div aria-label="Loading insights" className="insights-loading" role="status">
      <div className="insight-summary-grid">{Array.from({ length: 5 }, (_value, index) => <div className="insight-skeleton-card" key={index} />)}</div>
      <div className="insight-panel-skeleton" /><div className="insight-panel-skeleton" />
    </div>
  )
}

function InsightsPage() {
  const [searchParams, setSearchParams] = useSearchParams()
  const filters = filterValues(searchParams)
  const [retryKey, setRetryKey] = useState(0)
  const { state, error, insights, brands } = useInsightsData(filters, retryKey)

  useEffect(() => {
    const next = new URLSearchParams(searchParams)
    let changed = false
    if (!PERIODS.includes(Number(next.get('days')))) { next.set('days', '30'); changed = true }
    if (!['all', 'mine'].includes(next.get('scope'))) { next.set('scope', 'all'); changed = true }
    if (changed) setSearchParams(next, { replace: true })
  }, [searchParams, setSearchParams])

  function updateFilter(key, value) {
    const next = new URLSearchParams(searchParams)
    if (key === 'brand' && !value) next.delete('brand')
    else next.set(key, String(value))
    setSearchParams(next)
  }

  return (
    <section aria-labelledby="insights-page-title" className="insights-page">
      <div className="page-heading-row insights-page-heading">
        <div><p className="eyebrow">Patterns in your reviews</p><h1 id="insights-page-title">Insights</h1><p>Spot recurring issues and track how clear your copy reads over time.</p></div>
        <FilterBar brands={brands} filters={filters} onChange={updateFilter} />
      </div>

      {state === 'loading' && <LoadingSkeleton />}
      {state === 'error' && (
        <div className="insight-error" role="alert"><div><strong>Insights unavailable</strong><p>{error}</p></div><button className="button-secondary" onClick={() => setRetryKey((key) => key + 1)} type="button"><RotateCw aria-hidden="true" size={14} /> Retry</button></div>
      )}
      {state === 'success' && insights && (
        <>
          <SummaryCards totals={insights.totals} workflow={insights.workflow} />
          {insights.totals.reviews === 0 ? (
            <div className="insight-empty-state"><span><BarChart3 aria-hidden="true" size={24} /></span><h2>No reviews in this period</h2><p>Run a review to start spotting repeated issues and reading patterns.</p><Link className="button-primary" to="/">Run your first review</Link></div>
          ) : (
            <div className="insight-dashboard-grid">
              <TopIssues issues={insights.topIssues} truncated={insights.truncated} />
              <AllIssues issues={insights.allIssues} />
              <CategoryBreakdown categories={insights.byCategory} />
              <FindingsOverTime bucket={insights.period.bucket} data={insights.overTime} />
              <ReadabilityTrend bucket={insights.period.bucket} data={insights.readabilityTrend} />
              <WorkflowCard workflow={insights.workflow} />
            </div>
          )}
        </>
      )}
    </section>
  )
}

export default InsightsPage
