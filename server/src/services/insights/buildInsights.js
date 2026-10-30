const DAY_MS = 24 * 60 * 60 * 1000
const SEVERITIES = ['high', 'medium', 'low']
const STATUSES = ['open', 'accepted', 'dismissed']
const WORKFLOW_STATUSES = ['draft', 'pending_approval', 'approved', 'changes_requested']
const SEVERITY_ORDER = ['high', 'medium', 'low']

function validDate(value) {
  const date = value instanceof Date ? value : new Date(value)
  return Number.isFinite(date.getTime()) ? date : null
}

function mondayUTC(date) {
  const result = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()))
  const day = result.getUTCDay()
  result.setUTCDate(result.getUTCDate() - ((day + 6) % 7))
  return result
}

function bucketDate(date, bucket) {
  if (bucket === 'week') return mondayUTC(date)
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()))
}

function dateKey(date) {
  return date.toISOString()
}

function titleFor(key, titleLookup, review) {
  const brandKey = review?.brand ? String(review.brand) : review?.brandName ? `name:${review.brandName.toLocaleLowerCase()}` : ''
  if (titleLookup instanceof Map) return titleLookup.get(`${brandKey}|${key}`) ?? titleLookup.get(key) ?? key
  if (typeof titleLookup === 'function') return titleLookup(key) ?? key
  return titleLookup?.[key] ?? key
}

function findingKey(finding) {
  const code = typeof finding.evidence?.refCode === 'string' ? finding.evidence.refCode.trim() : ''
  if (code) return code
  if (finding.type === 'needs_verification') return 'NEEDS-VERIFICATION'
  return 'AI-FINDING'
}

function initialIssue(key, finding, reviewDate, titleLookup, review) {
  return {
    key,
    title: titleFor(key, titleLookup, review),
    categoryCounts: new Map(),
    kindCounts: new Map(),
    severityCounts: { high: 0, medium: 0, low: 0 },
    count: 0,
    accepted: 0,
    dismissed: 0,
    open: 0,
    lastSeen: reviewDate,
    exampleText: '',
    exampleDate: null,
    _add(finding, date) {
      this.count += 1
      const category = finding.category || 'uncategorized'
      const kind = finding.evidence?.kind || 'none'
      this.categoryCounts.set(category, (this.categoryCounts.get(category) ?? 0) + 1)
      this.kindCounts.set(kind, (this.kindCounts.get(kind) ?? 0) + 1)
      if (SEVERITIES.includes(finding.severity)) this.severityCounts[finding.severity] += 1
      if (STATUSES.includes(finding.status)) this[finding.status] += 1
      if (date && (!this.lastSeen || date > this.lastSeen)) this.lastSeen = date
      if (typeof finding.matchedText === 'string' && (!this.exampleDate || (date && date > this.exampleDate))) {
        this.exampleText = finding.matchedText.slice(0, 120)
        this.exampleDate = date
      }
    },
  }
}

function mostCommon(map, fallback) {
  return [...map.entries()].sort((left, right) => right[1] - left[1] || left[0].localeCompare(right[0]))[0]?.[0] ?? fallback
}

function emptyBucket(bucketStart) {
  return {
    bucketStart,
    reviews: 0,
    findings: 0,
    high: 0,
    medium: 0,
    low: 0,
    _gradeTotal: 0,
    _gradeCount: 0,
    _sentenceTotal: 0,
    _sentenceCount: 0,
    _easeTotal: 0,
    _easeCount: 0,
  }
}

function bucketsFor(from, to, bucket) {
  const first = bucketDate(from, bucket)
  const last = bucketDate(to, bucket)
  const result = []
  for (let time = first.getTime(); time <= last.getTime(); time += bucket === 'week' ? 7 * DAY_MS : DAY_MS) {
    result.push(emptyBucket(new Date(time)))
  }
  return result
}

function finiteMetric(value) {
  return typeof value === 'number' && Number.isFinite(value) ? value : null
}

function roundOne(value) {
  return Number(value.toFixed(1))
}

/**
 * Aggregate a capped, projected set of lean reviews in JavaScript. This keeps
 * the analytics transparent and is sufficient for the current 2,000-review cap.
 */
export function buildInsights(reviews, options = {}) {
  const to = validDate(options.to) ?? new Date()
  const from = validDate(options.from) ?? new Date(to.getTime() - 30 * DAY_MS)
  const derivedBucket = to.getTime() - from.getTime() > 31 * DAY_MS ? 'week' : 'day'
  const bucket = options.bucket === 'day' || options.bucket === 'week' ? options.bucket : derivedBucket
  const timeline = bucketsFor(from, to, bucket)
  const timelineByKey = new Map(timeline.map((entry) => [dateKey(entry.bucketStart), entry]))
  const issueMap = new Map()
  const totals = {
    reviews: reviews.length,
    findings: 0,
    bySeverity: { high: 0, medium: 0, low: 0 },
    byStatus: { open: 0, accepted: 0, dismissed: 0 },
    acceptanceRate: null,
  }
  const categoryMap = new Map()
  const workflow = { draft: 0, pending_approval: 0, approved: 0, changes_requested: 0, avgHoursToDecision: null }
  let decisionHoursTotal = 0
  let decisionCount = 0

  for (const review of reviews) {
    const createdAt = validDate(review.createdAt)
    if (!createdAt) continue
    const entry = timelineByKey.get(dateKey(bucketDate(createdAt, bucket)))
    if (entry) entry.reviews += 1

    const workflowStatus = WORKFLOW_STATUSES.includes(review.workflowStatus) ? review.workflowStatus : 'draft'
    workflow[workflowStatus] += 1
    const submittedAt = validDate(review.submittedAt)
    const decidedAt = validDate(review.decidedAt)
    if (submittedAt && decidedAt) {
      const hours = (decidedAt.getTime() - submittedAt.getTime()) / (60 * 60 * 1000)
      if (Number.isFinite(hours) && hours >= 0) {
        decisionHoursTotal += hours
        decisionCount += 1
      }
    }

    const readability = review.summary?.readability ?? {}
    if (entry) {
      const grade = finiteMetric(readability.fleschKincaidGrade)
      const sentenceLength = finiteMetric(readability.avgSentenceLength)
      const readingEase = finiteMetric(readability.fleschReadingEase)
      if (grade !== null) { entry._gradeTotal += grade; entry._gradeCount += 1 }
      if (sentenceLength !== null) { entry._sentenceTotal += sentenceLength; entry._sentenceCount += 1 }
      if (readingEase !== null) { entry._easeTotal += readingEase; entry._easeCount += 1 }
    }

    for (const finding of review.findings ?? []) {
      totals.findings += 1
      if (SEVERITIES.includes(finding.severity)) {
        totals.bySeverity[finding.severity] += 1
        if (entry) entry[finding.severity] += 1
      }
      if (STATUSES.includes(finding.status)) totals.byStatus[finding.status] += 1
      if (entry) entry.findings += 1
      const category = finding.category || 'uncategorized'
      if (!categoryMap.has(category)) categoryMap.set(category, { category, count: 0, high: 0, medium: 0, low: 0 })
      const categoryEntry = categoryMap.get(category)
      categoryEntry.count += 1
      if (SEVERITIES.includes(finding.severity)) categoryEntry[finding.severity] += 1

      const key = findingKey(finding)
      const scopedKey = review.brand ? `${String(review.brand)}|${key}` : `${review.brandName ? `name:${review.brandName.toLocaleLowerCase()}` : ''}|${key}`
      if (!issueMap.has(scopedKey)) issueMap.set(scopedKey, initialIssue(key, finding, createdAt, options.titleLookup, review))
      issueMap.get(scopedKey)._add(finding, createdAt)
    }
  }

  const decidedCount = totals.byStatus.accepted + totals.byStatus.dismissed
  if (decidedCount) totals.acceptanceRate = roundOne(totals.byStatus.accepted / decidedCount)
  if (decisionCount) workflow.avgHoursToDecision = roundOne(decisionHoursTotal / decisionCount)

  const allIssues = [...issueMap.values()]
    .map((issue) => ({
      key: issue.key,
      title: issue.title,
      category: mostCommon(issue.categoryCounts, 'uncategorized'),
      kind: mostCommon(issue.kindCounts, 'none'),
      count: issue.count,
      severity: SEVERITY_ORDER.find((severity) => issue.severityCounts[severity] === Math.max(...Object.values(issue.severityCounts))) ?? 'low',
      accepted: issue.accepted,
      dismissed: issue.dismissed,
      open: issue.open,
      lastSeen: issue.lastSeen,
      exampleText: issue.exampleText,
    }))
    .sort((left, right) => right.count - left.count || (validDate(right.lastSeen)?.getTime() ?? 0) - (validDate(left.lastSeen)?.getTime() ?? 0) || left.key.localeCompare(right.key))
    .slice(0, 25)

  const overTime = timeline.map(({ _gradeTotal, _gradeCount, _sentenceTotal, _sentenceCount, _easeTotal, _easeCount, ...entry }) => entry)
  const readabilityTrend = timeline.map((entry) => ({
    bucketStart: entry.bucketStart,
    avgGrade: entry._gradeCount ? roundOne(entry._gradeTotal / entry._gradeCount) : null,
    avgSentenceLength: entry._sentenceCount ? roundOne(entry._sentenceTotal / entry._sentenceCount) : null,
    avgReadingEase: entry._easeCount ? roundOne(entry._easeTotal / entry._easeCount) : null,
  }))

  return {
    period: { from, to, bucket },
    totals,
    topIssues: allIssues.slice(0, 5),
    allIssues,
    byCategory: [...categoryMap.values()].sort((left, right) => right.count - left.count || left.category.localeCompare(right.category)),
    overTime,
    readabilityTrend,
    workflow,
  }
}
