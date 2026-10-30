import { BookOpenText, TextCursorInput } from 'lucide-react'

function number(value, digits = 1) {
  return Number.isFinite(value) ? value.toFixed(digits) : '—'
}

function readingEaseLabel(score) {
  if (!Number.isFinite(score)) return 'Unavailable'
  if (score >= 90) return 'Very easy'
  if (score >= 80) return 'Easy'
  if (score >= 70) return 'Fairly easy'
  if (score >= 60) return 'Standard'
  if (score >= 50) return 'Fairly difficult'
  if (score >= 30) return 'Difficult'
  return 'Very difficult'
}

function ReadabilityPanel({ metrics }) {
  const values = [
    ['Grade level', number(metrics.fleschKincaidGrade), 'Flesch-Kincaid'],
    ['Reading ease', readingEaseLabel(metrics.fleschReadingEase), `${number(metrics.fleschReadingEase)} score`],
    ['Avg. sentence', number(metrics.avgSentenceLength), 'words per sentence'],
    ['Long sentences', Number.isFinite(metrics.longSentenceCount) ? metrics.longSentenceCount : '—', 'over the configured limit'],
    ['Words', Number.isFinite(metrics.wordCount) ? metrics.wordCount : '—', 'in reviewed copy'],
    ['Sentences', Number.isFinite(metrics.sentenceCount) ? metrics.sentenceCount : '—', 'detected'],
  ]

  return (
    <section aria-labelledby="readability-title" className="readability-panel">
      <div className="readability-heading">
        <div>
          <p className="eyebrow">Content insight</p>
          <h2 id="readability-title"><BookOpenText aria-hidden="true" size={17} /> Readability</h2>
        </div>
        <p><TextCursorInput aria-hidden="true" size={14} /> Lower grade levels are generally easier to read.</p>
      </div>
      <dl className="readability-grid">
        {values.map(([label, value, detail]) => (
          <div className="readability-metric" key={label}>
            <dt>{label}</dt>
            <dd>{value}</dd>
            <span>{detail}</span>
          </div>
        ))}
      </dl>
    </section>
  )
}

export default ReadabilityPanel
