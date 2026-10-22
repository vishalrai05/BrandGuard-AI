const chips = [
  { key: 'all', label: 'Total', value: 'total' },
  { key: 'high', label: 'High', value: 'high' },
  { key: 'medium', label: 'Medium', value: 'medium' },
  { key: 'low', label: 'Low', value: 'low' },
  { key: 'needs_verification', label: 'Needs verification', value: 'needsVerification', tone: 'verification' },
]

function SummaryBar({ summary, filter, onFilterChange }) {
  return (
    <section aria-label="Review summary" className="summary-bar">
      <h2>Findings</h2>
      {chips.map(({ key, label, value, tone }) => (
        <button
          aria-pressed={filter === key}
          className={`summary-chip ${tone === 'verification' ? 'summary-chip-verification' : ''}`}
          key={key}
          onClick={() => onFilterChange(filter === key && key !== 'all' ? 'all' : key)}
          type="button"
        >
          {label}<span>{summary[value] ?? 0}</span>
        </button>
      ))}
    </section>
  )
}

export default SummaryBar
