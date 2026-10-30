export function calculateComplianceScore(findings = []) {
  const penalty = findings.reduce((total, finding) => {
    if (finding.type === 'needs_verification') return total + 4
    return total + ({ high: 10, medium: 5, low: 2 }[finding.severity] ?? 0)
  }, 0)
  return Math.max(0, 100 - penalty)
}
