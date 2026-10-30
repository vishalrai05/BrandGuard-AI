const ruleTypeLabels = {
  banned_term: 'Banned term',
  required_phrase: 'Required phrase',
  regex_pattern: 'Regex pattern',
}

export function findingTypeLabel(finding, evidenceRecord) {
  if (finding?.type === 'quality_check' || finding?.evidence?.kind === 'check') return 'Quality check'
  if (finding?.type === 'rule_violation') {
    return ruleTypeLabels[evidenceRecord?.type] ?? 'Brand rule'
  }
  if (finding?.type === 'fact_mismatch') return 'Fact mismatch'
  if (finding?.type === 'needs_verification') return 'Needs verification'
  return 'Finding'
}
