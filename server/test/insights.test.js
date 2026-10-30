import assert from 'node:assert/strict'
import mongoose from 'mongoose'
import test from 'node:test'
import Fact from '../src/models/Fact.js'
import Review from '../src/models/Review.js'
import Rule from '../src/models/Rule.js'
import insightsRouter, { getInsightBrands, getInsights } from '../src/routes/insights.js'
import { requireAuth } from '../src/middleware/auth.js'
import { buildInsights } from '../src/services/insights/buildInsights.js'

const day = 24 * 60 * 60 * 1000

function finding(refCode, status = 'open', severity = 'medium', overrides = {}) {
  return {
    type: refCode ? 'rule_violation' : 'needs_verification',
    severity,
    status,
    matchedText: `Example text for ${refCode ?? 'unverified claim'}`,
    evidence: { refCode, kind: refCode ? 'rule' : 'none' },
    category: 'claims',
    ...overrides,
  }
}

function response() {
  return { statusCode: 200, status(code) { this.statusCode = code; return this }, json(body) { this.body = body; return this } }
}

function setupReviewQuery(documents) {
  const originals = { find: Review.find, aggregate: Review.aggregate, ruleFind: Rule.find, factFind: Fact.find }
  let filter
  let projection
  let cap
  Review.find = (value) => {
    filter = value
    const query = {
      select(value) { projection = value; return query },
      sort() { return query },
      limit(value) { cap = value; return query },
      lean: async () => documents,
    }
    return query
  }
  Rule.find = () => ({ select() { return this }, lean: async () => [{ code: 'TERM-01', title: 'Approved product spelling' }] })
  Fact.find = () => ({ select() { return this }, lean: async () => [{ code: 'FACT-01', statement: 'Approved account count' }] })
  return {
    get filter() { return filter },
    get projection() { return projection },
    get cap() { return cap },
    restore() { Object.assign(Review, { find: originals.find, aggregate: originals.aggregate }); Rule.find = originals.ruleFind; Fact.find = originals.factFind },
  }
}

test('buildInsights on empty input returns zero totals, empty issue arrays and null rates', () => {
  const from = new Date('2026-01-01T00:00:00.000Z')
  const to = new Date('2026-01-03T00:00:00.000Z')
  const result = buildInsights([], { from, to })
  assert.deepEqual(result.totals, {
    reviews: 0,
    findings: 0,
    bySeverity: { high: 0, medium: 0, low: 0 },
    byStatus: { open: 0, accepted: 0, dismissed: 0 },
    acceptanceRate: null,
  })
  assert.deepEqual(result.topIssues, [])
  assert.deepEqual(result.allIssues, [])
  assert.deepEqual(result.byCategory, [])
  assert.equal(result.workflow.avgHoursToDecision, null)
  assert.ok(result.overTime.every((entry) => entry.reviews === 0 && entry.findings === 0))
  assert.ok(!JSON.stringify(result).match(/NaN|Infinity/))
})

test('top issues sort by count then latest occurrence and are capped at five', () => {
  const from = new Date('2026-01-01T00:00:00.000Z')
  const reviews = [
    { createdAt: new Date('2026-01-02T00:00:00Z'), findings: [finding('A'), finding('B'), finding('C'), finding('D'), finding('E'), finding('F'), finding('G')] },
    { createdAt: new Date('2026-01-03T00:00:00Z'), findings: [finding('A'), finding('B'), finding('C')] },
    { createdAt: new Date('2026-01-04T00:00:00Z'), findings: [finding('A'), finding('D'), finding('E')] },
    { createdAt: new Date('2026-01-04T00:00:00Z'), findings: Array.from({ length: 30 }, (_value, index) => finding(`EXTRA-${index}`)) },
  ]
  const result = buildInsights(reviews, { from, to: new Date('2026-01-05T00:00:00Z'), titleLookup: { A: 'Issue A' } })
  assert.deepEqual(result.topIssues.map((issue) => issue.key), ['A', 'D', 'E', 'B', 'C'])
  assert.equal(result.topIssues.length, 5)
  assert.equal(result.allIssues.length, 25)
  assert.equal(result.topIssues[0].title, 'Issue A')
  assert.equal(result.topIssues[0].exampleText.length <= 120, true)
})

test('findings without reference codes use stable keys', () => {
  const result = buildInsights([{ createdAt: new Date('2026-01-02Z'), findings: [
    finding('', 'open', 'medium', { type: 'needs_verification', evidence: { refCode: '', kind: 'none' } }),
    finding('', 'open', 'medium', { type: 'fact_mismatch', evidence: { refCode: '', kind: 'none' } }),
  ] }], { from: new Date('2026-01-01Z'), to: new Date('2026-01-03Z') })
  assert.deepEqual(result.allIssues.map((issue) => issue.key).sort(), ['AI-FINDING', 'NEEDS-VERIFICATION'])
})

test('title lookup distinguishes the same rule code across brands', () => {
  const from = new Date('2026-01-01T00:00:00.000Z')
  const to = new Date('2026-01-02T00:00:00.000Z')
  const brandA = new mongoose.Types.ObjectId()
  const brandB = new mongoose.Types.ObjectId()
  const lookup = new Map([[`${brandA}|TERM-01`, 'Brand A title'], [`${brandB}|TERM-01`, 'Brand B title']])
  const reviews = [brandA, brandB].map((brand) => ({ brand, brandName: 'Brand', createdAt: to, findings: [finding('TERM-01')] }))
  const result = buildInsights(reviews, { from, to, titleLookup: lookup })
  assert.deepEqual(new Set(result.allIssues.map((issue) => issue.title)), new Set(['Brand A title', 'Brand B title']))
})

test('acceptance rate is accepted divided by accepted plus dismissed', () => {
  const from = new Date('2026-01-01Z')
  const noDecisions = buildInsights([{ createdAt: new Date('2026-01-02Z'), findings: [finding('X', 'open')] }], { from, to: new Date('2026-01-03Z') })
  assert.equal(noDecisions.totals.acceptanceRate, null)
  const withDecisions = buildInsights([{ createdAt: new Date('2026-01-02Z'), findings: [finding('X', 'accepted'), finding('X', 'dismissed'), finding('Y', 'dismissed')] }], { from, to: new Date('2026-01-03Z') })
  assert.equal(withDecisions.totals.acceptanceRate, 0.3)
})

test('day and week buckets fill gaps and weeks start Monday UTC', () => {
  const monday = new Date('2026-03-02T00:00:00.000Z')
  const dayResult = buildInsights([{ createdAt: new Date('2026-03-04T12:00:00Z'), findings: [finding('X', 'open', 'high')] }], {
    from: monday,
    to: new Date('2026-03-06T00:00:00Z'),
  })
  assert.equal(dayResult.period.bucket, 'day')
  assert.equal(dayResult.overTime.length, 5)
  assert.equal(dayResult.overTime[0].bucketStart.toISOString(), '2026-03-02T00:00:00.000Z')
  assert.equal(dayResult.overTime[1].findings, 0)
  assert.equal(dayResult.overTime[2].high, 1)

  const weekResult = buildInsights([], { from: monday, to: new Date(monday.getTime() + 35 * day) })
  assert.equal(weekResult.period.bucket, 'week')
  assert.equal(weekResult.overTime[0].bucketStart.toISOString(), '2026-03-02T00:00:00.000Z')
  assert.equal(weekResult.overTime[1].bucketStart.toISOString(), '2026-03-09T00:00:00.000Z')
})

test('legacy reviews without ownership, workflow status or readability do not throw', () => {
  const result = buildInsights([{ createdAt: new Date('2026-01-02Z'), findings: [finding('TERM-01')] }], {
    from: new Date('2026-01-01Z'), to: new Date('2026-01-03Z'), titleLookup: new Map([['TERM-01', 'Spelling']]),
  })
  assert.equal(result.workflow.draft, 1)
  assert.equal(result.topIssues[0].title, 'Spelling')
  assert.equal(result.readabilityTrend[1].avgGrade, null)
})

test('legacy Review hydration does not fabricate an empty readability object', () => {
  const legacy = Review.hydrate({ brandName: 'Old brand', inputText: 'Old copy.', summary: { total: 1 } })
  assert.equal(legacy.summary.readability, undefined)
  const current = Review.hydrate({ brandName: 'New brand', inputText: 'New copy.', summary: { readability: { wordCount: 2, sentenceCount: 1 } } })
  assert.equal(current.summary.readability.wordCount, 2)
})

test('average decision time is rounded and ignores reviews missing either timestamp', () => {
  const result = buildInsights([
    { createdAt: new Date('2026-01-02Z'), submittedAt: new Date('2026-01-02T00:00:00Z'), decidedAt: new Date('2026-01-02T01:15:00Z'), findings: [] },
    { createdAt: new Date('2026-01-02Z'), submittedAt: new Date('2026-01-02T00:00:00Z'), findings: [] },
  ], { from: new Date('2026-01-01Z'), to: new Date('2026-01-03Z') })
  assert.equal(result.workflow.avgHoursToDecision, 1.3)
})

test('insights routes require authentication and reject invalid days', async () => {
  assert.equal(insightsRouter.stack[0].handle, requireAuth)
  const unauthenticated = response()
  let next = false
  await requireAuth({ get: () => undefined }, unauthenticated, () => { next = true })
  assert.equal(unauthenticated.statusCode, 401)
  assert.equal(next, false)

  for (const days of ['0', '999']) {
    const invalid = response()
    await getInsights({ query: { days }, user: { _id: new mongoose.Types.ObjectId() } }, invalid)
    assert.equal(invalid.statusCode, 400)
    assert.ok(invalid.body.error)
  }
})

test('scope=mine filters by current user and response excludes private review fields', async () => {
  const userId = new mongoose.Types.ObjectId()
  const documents = [{
    _id: new mongoose.Types.ObjectId(),
    createdAt: new Date(),
    createdBy: userId,
    brandName: 'Nimbus Notes',
    inputText: 'private full input',
    workflowStatus: 'draft',
    findings: [finding('TERM-01', 'open', 'high')],
  }]
  const mock = setupReviewQuery(documents)
  try {
    const res = response()
    await getInsights({ query: { days: '30', scope: 'mine', brand: 'nImBuS nOtEs' }, user: { _id: userId } }, res)
    assert.equal(String(mock.filter.createdBy), String(userId))
    assert.equal(mock.filter.brandName.test('Nimbus Notes'), true)
    assert.equal(mock.cap, 2000)
    assert.ok(!Object.hasOwn(mock.projection, 'inputText'))
    const serialized = JSON.stringify(res.body)
    assert.ok(!serialized.includes('private full input'))
    assert.ok(!serialized.includes('email'))
    assert.ok(!serialized.includes('passwordHash'))
    assert.equal(res.body.topIssues[0].title, 'Approved product spelling')
    assert.equal(res.body.truncated, false)
  } finally {
    mock.restore()
  }
})

test('brands endpoint returns aggregate counts without full reviews', async () => {
  const originalAggregate = Review.aggregate
  let pipeline
  Review.aggregate = async (value) => { pipeline = value; return [{ brandName: 'Nimbus Notes', count: 2 }] }
  try {
    const res = response()
    await getInsightBrands({}, res)
    assert.deepEqual(res.body, [{ brandName: 'Nimbus Notes', count: 2 }])
    assert.ok(pipeline.some((stage) => stage.$group))
  } finally {
    Review.aggregate = originalAggregate
  }
})
