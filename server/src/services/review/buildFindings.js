export default function buildFindings(ruleFindings, factFindings) {
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
    findings.push({ source: 'rules', ...finding })
  }

  findings.sort(
    (left, right) =>
      left.startIndex - right.startIndex || left.endIndex - right.endIndex,
  )

  return findings
}
