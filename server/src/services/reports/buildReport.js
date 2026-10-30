import { createHash } from 'node:crypto'
import { calculateComplianceScore } from '../complianceScore.js'

function publicUser(user) {
  if (!user) return null
  return { name: user.name ?? '', role: user.role ?? '' }
}

function dateValue(value) {
  if (!value) return null
  const date = value instanceof Date ? value : new Date(value)
  return Number.isFinite(date.getTime()) ? date.toISOString() : null
}

function toLookup(value) {
  if (value instanceof Map) return value
  return new Map(Object.entries(value ?? {}))
}

function canonicalFingerprint(review) {
  const findings = (review.findings ?? []).map((finding) => ({
    type: finding.type ?? '',
    matchedText: finding.matchedText ?? '',
    startIndex: Number.isFinite(finding.startIndex) ? finding.startIndex : null,
    endIndex: Number.isFinite(finding.endIndex) ? finding.endIndex : null,
    refCode: finding.evidence?.refCode ?? '',
    status: finding.status ?? 'open',
  })).sort((left, right) =>
    (left.startIndex ?? -1) - (right.startIndex ?? -1)
    || (left.endIndex ?? -1) - (right.endIndex ?? -1)
    || left.type.localeCompare(right.type)
    || left.refCode.localeCompare(right.refCode)
    || left.matchedText.localeCompare(right.matchedText),
  )
  const canonical = JSON.stringify({
    findings,
    workflowStatus: review.workflowStatus ?? 'draft',
    decidedAt: dateValue(review.decidedAt),
  })
  return createHash('sha256').update(canonical, 'utf8').digest('hex')
}

function evidenceTitle(finding, ruleTitles, factTitles, qualityTitles, brandId) {
  const code = finding.evidence?.refCode ?? ''
  const lookup = finding.evidence?.kind === 'rule' ? ruleTitles
    : finding.evidence?.kind === 'fact' ? factTitles
      : finding.evidence?.kind === 'check' ? qualityTitles : new Map()
  return lookup.get(`${brandId ? String(brandId) : ''}|${code}`) ?? lookup.get(code) ?? code ?? ''
}

function findingSource(finding) {
  if (finding.evidence?.kind === 'check' || finding.type === 'quality_check') return 'check'
  if (finding.source === 'ai') return 'ai'
  return 'rules'
}

function makeFinding(finding, index, options, lookups, brandId) {
  const isFact = finding.evidence?.kind === 'fact'
  const comments = options.includeComments
    ? (finding.comments ?? []).map((comment) => ({
      authorName: comment.authorName ?? '',
      authorRole: comment.authorRole ?? '',
      text: comment.text ?? '',
      createdAt: dateValue(comment.createdAt),
    }))
    : []
  const result = {
    number: index + 1,
    severity: finding.severity,
    type: finding.type,
    category: finding.category ?? '',
    source: findingSource(finding),
    evidence: {
      kind: finding.evidence?.kind ?? 'none',
      refCode: finding.evidence?.refCode ?? '',
      title: evidenceTitle(finding, lookups.rules, lookups.facts, lookups.quality, brandId),
      excerpt: finding.evidence?.excerpt ?? '',
      ...(isFact && (lookups.factSources.get(`${brandId ? String(brandId) : ''}|${finding.evidence?.refCode}`) ?? lookups.factSources.get(finding.evidence?.refCode))
        ? { sourceName: lookups.factSources.get(`${brandId ? String(brandId) : ''}|${finding.evidence?.refCode}`) ?? lookups.factSources.get(finding.evidence.refCode) } : {}),
    },
    matchedText: String(finding.matchedText ?? '').slice(0, 300),
    suggestion: finding.suggestion ?? '',
    suggestedRewrite: finding.suggestedRewrite ?? '',
    status: finding.status ?? 'open',
    statusChangedBy: publicUser(finding.statusChangedBy),
    statusChangedAt: dateValue(finding.statusChangedAt),
    comments,
  }
  return result
}

function disclosuresFor(review, options) {
  const disclosures = []
  if (review.aiStatus === 'disabled') disclosures.push('AI was not used')
  else if (review.aiStatus === 'failed' || review.aiStatus === 'unavailable') disclosures.push('AI analysis was attempted but could not be completed; rule-based checks remain available')
  else disclosures.push('AI-assisted analysis was used and every AI finding was validated against the rules and facts library')
  if (review.aiStatus === 'partial') {
    disclosures.push(`AI analysed ${review.ai?.chunksAnalysed ?? 0} of ${review.ai?.chunksTotal ?? 0} sections; the remaining sections were covered by rule-based checks only`)
  }
  if (!review.qualityChecksRun) disclosures.push('Readability and accessibility checks were not run')
  if (review.workflowStatus !== 'approved') disclosures.push('This review has not been approved')
  if (review.source?.truncated) disclosures.push('The source document text was truncated')
  if (review.findingsTruncated) disclosures.push('Findings were capped at 1,000')
  disclosures.push('Findings are only as complete as the rules and facts library')
  if (options.includeFullText) disclosures.push('The full submitted text is included in this report')
  return disclosures
}

export function buildReport({ review, auditEntries = [], rules = [], facts = [], qualityTitles = {}, options = {}, now, generatedBy = options.generatedBy }) {
  const normalizedOptions = {
    includeFullText: options.includeFullText === true,
    includeComments: options.includeComments !== false,
    includeAudit: options.includeAudit !== false,
  }
  const ruleTitles = new Map()
  const factTitles = new Map()
  const factSources = new Map()
  for (const rule of rules) {
    if (rule.brand) ruleTitles.set(`${String(rule.brand)}|${rule.code}`, rule.title)
    else ruleTitles.set(rule.code, rule.title)
  }
  for (const fact of facts) {
    if (fact.brand) { factTitles.set(`${String(fact.brand)}|${fact.code}`, fact.statement); if (fact.source?.name) factSources.set(`${String(fact.brand)}|${fact.code}`, fact.source.name) }
    if (!fact.brand) {
      factTitles.set(fact.code, fact.statement)
      if (fact.source?.name) factSources.set(fact.code, fact.source.name)
    }
  }
  const lookups = { rules: ruleTitles, facts: factTitles, quality: toLookup(qualityTitles), factSources }
  const rawFindings = review.findings ?? []
  const findings = rawFindings.map((finding, index) => makeFinding(finding, index, normalizedOptions, lookups, review.brand))
  const readability = review.summary?.readability
  const readabilitySummary = readability ? {
    wordCount: readability.wordCount ?? 0,
    sentenceCount: readability.sentenceCount ?? 0,
    avgSentenceLength: readability.avgSentenceLength ?? 0,
    fleschReadingEase: readability.fleschReadingEase ?? 0,
    fleschKincaidGrade: readability.fleschKincaidGrade ?? 0,
    longSentenceCount: readability.longSentenceCount ?? 0,
  } : null
  const summary = {
    total: findings.length,
    high: findings.filter((finding) => finding.severity === 'high').length,
    medium: findings.filter((finding) => finding.severity === 'medium').length,
    low: findings.filter((finding) => finding.severity === 'low').length,
    needsVerification: findings.filter((finding) => finding.type === 'needs_verification').length,
    complianceScore: calculateComplianceScore(rawFindings),
    byStatus: {
      open: findings.filter((finding) => finding.status === 'open').length,
      accepted: findings.filter((finding) => finding.status === 'accepted').length,
      dismissed: findings.filter((finding) => finding.status === 'dismissed').length,
    },
    readability: readabilitySummary,
  }
  const generatedAt = dateValue(now) ?? dateValue(review.createdAt) ?? '1970-01-01T00:00:00.000Z'
  const fingerprint = canonicalFingerprint(review)
  const reportId = `report-${createHash('sha256').update(JSON.stringify({ fingerprint, generatedAt, options: normalizedOptions }), 'utf8').digest('hex').slice(0, 24)}`
  const status = review.workflowStatus ?? 'draft'
  const source = review.source ? {
    kind: review.source.kind,
    ...(review.source.filename !== undefined ? { filename: review.source.filename } : {}),
    ...(review.source.fileType !== undefined ? { fileType: review.source.fileType } : {}),
    ...(review.source.pageCount !== undefined ? { pageCount: review.source.pageCount } : {}),
    ...(review.source.charCount !== undefined ? { charCount: review.source.charCount } : {}),
    ...(review.source.truncated !== undefined ? { truncated: review.source.truncated } : {}),
  } : { kind: 'text' }
  const ai = review.ai ? {
    ...(review.ai.chunksTotal !== undefined ? { chunksTotal: review.ai.chunksTotal } : {}),
    ...(review.ai.chunksAnalysed !== undefined ? { chunksAnalysed: review.ai.chunksAnalysed } : {}),
    ...(review.ai.message !== undefined ? { message: review.ai.message } : {}),
  } : null
  const full = {
    reportId,
    generatedAt,
    generatedBy: publicUser(generatedBy),
    fingerprint,
    review: {
      id: String(review._id ?? review.id),
      brandName: review.brandName ?? '',
      createdAt: dateValue(review.createdAt),
      createdBy: publicUser(review.createdBy),
      workflowStatus: status,
      source,
      aiStatus: review.aiStatus ?? 'disabled',
      ai,
      qualityChecksRun: review.qualityChecksRun === true,
    },
    summary,
    sections: {
      highSeverity: findings.filter((finding) => finding.severity === 'high'),
      mediumSeverity: findings.filter((finding) => finding.severity === 'medium'),
      lowSeverity: findings.filter((finding) => finding.severity === 'low'),
    },
    findings,
    approval: {
      status,
      submittedBy: publicUser(review.submittedBy),
      submittedAt: dateValue(review.submittedAt),
      decidedBy: publicUser(review.decidedBy),
      decidedAt: dateValue(review.decidedAt),
      decisionNote: review.decisionNote ?? '',
    },
    auditTrail: normalizedOptions.includeAudit ? auditEntries.map((entry) => ({
      at: dateValue(entry.createdAt),
      actorName: entry.actorName ?? '',
      actorRole: entry.actorRole ?? '',
      action: entry.action,
      from: entry.from ?? null,
      to: entry.to ?? null,
      note: entry.note ?? '',
    })) : [],
    library: { rulesCount: rules.length, factsCount: facts.length, qualityChecksCount: toLookup(qualityTitles).size },
    disclosures: disclosuresFor({
      aiStatus: review.aiStatus,
      ai: review.ai,
      qualityChecksRun: review.qualityChecksRun,
      workflowStatus: status,
      source: review.source,
      findingsTruncated: review.findingsTruncated,
    }, normalizedOptions),
    options: normalizedOptions,
  }
  if (normalizedOptions.includeFullText) full.fullText = review.inputText ?? ''
  return full
}

export { canonicalFingerprint }
