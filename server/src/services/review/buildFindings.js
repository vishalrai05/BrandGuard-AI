export default function buildFindings(ruleFindings, factFindings, qualityFindings = []) {
  const findings = []
  const seen = new Set()
  const mismatchedClaims = new Set(
    factFindings
      .filter((finding) => finding.type === 'fact_mismatch')
      .map((finding) => `${finding.startIndex}:${finding.endIndex}`),
  )

  for (const finding of [...ruleFindings, ...factFindings]) {
    if (
      finding.type === 'needs_verification' &&
      mismatchedClaims.has(`${finding.startIndex}:${finding.endIndex}`)
    ) {
      continue
    }

    const key = [
      finding.startIndex,
      finding.endIndex,
      finding.evidence.refCode ?? '',
    ].join(':')

    if (seen.has(key)) {
      continue
    }

    seen.add(key)
    findings.push({ source: finding.source ?? 'rules', ...finding })
  }

  const ruleSpanCategories = new Set(findings
    .filter((finding) => finding.source === 'rules')
    .map((finding) => `${finding.startIndex}:${finding.endIndex}:${finding.category ?? ''}`))
  for (const finding of qualityFindings) {
    // Exact-span findings from different categories are useful together; when
    // the categories match, the original rule finding remains authoritative.
    if (ruleSpanCategories.has(`${finding.startIndex}:${finding.endIndex}:${finding.category ?? ''}`)) continue
    findings.push({ source: 'quality', ...finding })
  }

  findings.sort(
    (left, right) =>
      left.startIndex - right.startIndex || left.endIndex - right.endIndex,
  )

  return findings
}
