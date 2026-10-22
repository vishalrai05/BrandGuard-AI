function ScoreRing({ findings }) {
  // Score = max(0, 100 − penalties). Each finding: high=10, medium=5, low=2, needs-verification=4.
  const penalty = findings.reduce((total, finding) => {
    if (finding.type === 'needs_verification') return total + 4
    return total + ({ high: 10, medium: 5, low: 2 }[finding.severity] ?? 0)
  }, 0)
  const score = Math.max(0, 100 - penalty)
  const color = score >= 80 ? 'var(--success)' : score >= 55 ? 'var(--medium)' : 'var(--high)'

  return (
    <div aria-label={`Compliance score ${score} out of 100`} className="score-ring" style={{ '--score': `${score}%`, '--score-color': color }} role="img">
      <div className="score-ring-inner">
        <strong>{score}</strong>
        <span>score</span>
      </div>
    </div>
  )
}

export default ScoreRing
