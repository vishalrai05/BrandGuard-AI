import assert from 'node:assert/strict'
import mongoose from 'mongoose'
import test from 'node:test'
import AuditLog from '../src/models/AuditLog.js'
import Fact from '../src/models/Fact.js'
import Review from '../src/models/Review.js'
import Rule from '../src/models/Rule.js'
import { requireAuth } from '../src/middleware/auth.js'
import { calculateComplianceScore } from '../src/services/complianceScore.js'
import { buildReport } from '../src/services/reports/buildReport.js'
import reviewsRouter, { getReportSummary, getReviewReport } from '../src/routes/reviews.js'
import { findingsCsv, summaryCsv } from '../../client/src/utils/reportExport.js'

function response() {
  return {
    statusCode: 200,
    headers: {},
    status(code) { this.statusCode = code; return this },
    set(name, value) { this.headers[name] = value; return this },
    json(body) { this.body = body; return this },
  }
}

const user = (name, role, email = 'private@example.test') => ({ name, role, email, passwordHash: 'never-expose' })

function sampleReview() {
  return {
    _id: new mongoose.Types.ObjectId(),
    brandName: 'Nimbus Notes',
    inputText: 'Full source text with private@example.test',
    createdAt: new Date('2026-10-01T10:00:00.000Z'),
    createdBy: user('Rae Reviewer', 'reviewer'),
    workflowStatus: 'approved',
    submittedBy: user('Rae Reviewer', 'reviewer'),
    submittedAt: new Date('2026-10-01T11:00:00.000Z'),
    decidedBy: user('Ari Approver', 'approver'),
    decidedAt: new Date('2026-10-01T12:00:00.000Z'),
    decisionNote: 'Approved after checking evidence.',
    source: { kind: 'document', filename: 'launch.pdf', fileType: 'pdf', pageCount: 2, charCount: 160, truncated: false },
    aiStatus: 'ok',
    ai: { chunksTotal: 1, chunksAnalysed: 1 },
    qualityChecksRun: true,
    findingsTruncated: false,
    summary: { readability: { wordCount: 30, sentenceCount: 2, avgSentenceLength: 15, fleschReadingEase: 70, fleschKincaidGrade: 8, longSentenceCount: 0 } },
    findings: [
      { type: 'rule_violation', source: 'rules', severity: 'high', category: 'terminology', matchedText: 'Best ever', startIndex: 0, endIndex: 9, evidence: { kind: 'rule', refCode: 'TERM-01', excerpt: 'Never use this phrase' }, suggestion: 'Use a specific benefit.', status: 'open', comments: [] },
      { type: 'fact_mismatch', source: 'rules', severity: 'medium', category: 'claims', matchedText: '25 million users', startIndex: 10, endIndex: 26, evidence: { kind: 'fact', refCode: 'FACT-01', excerpt: 'Verified figure' }, status: 'accepted', statusChangedBy: user('Sam', 'reviewer'), statusChangedAt: new Date('2026-10-01T10:30:00.000Z'), comments: [{ authorName: 'Ari', authorRole: 'approver', text: 'Source this number.', createdAt: new Date('2026-10-01T10:31:00.000Z') }] },
      { type: 'quality_check', source: 'quality', severity: 'low', category: 'readability', matchedText: 'A long line', startIndex: 27, endIndex: 38, evidence: { kind: 'check', refCode: 'READ-01', excerpt: 'Long sentence.' }, status: 'dismissed' },
      { type: 'needs_verification', source: 'ai', severity: 'medium', category: 'claims', matchedText: 'Twice as creative', startIndex: 39, endIndex: 57, evidence: { kind: 'none', refCode: '', excerpt: 'Needs evidence.' }, suggestion: 'Add substantiation.', suggestedRewrite: 'Teams can work together.', status: 'open' },
    ],
  }
}

test('buildReport returns grouped findings, counts, evidence titles, and safe snapshots', () => {
  const report = buildReport({
    review: sampleReview(),
    generatedBy: user('Morgan', 'approver'),
    rules: [{ code: 'TERM-01', title: 'Avoid superlatives' }],
    facts: [{ code: 'FACT-01', statement: 'Twenty million accounts', source: { name: 'Annual report', url: 'private' } }],
    qualityTitles: { 'READ-01': 'Long sentence' },
    auditEntries: [{ createdAt: new Date(), actorName: 'Rae', actorRole: 'reviewer', action: 'review_created', note: 'created' }],
    now: new Date('2026-10-02T00:00:00.000Z'),
  })
  assert.equal(report.findings.length, 4)
  assert.equal(report.sections.highSeverity.length, 1)
  assert.equal(report.sections.mediumSeverity.length, 2)
  assert.equal(report.sections.lowSeverity.length, 1)
  assert.equal(report.summary.total, 4)
  assert.equal(report.summary.needsVerification, 1)
  assert.deepEqual(report.summary.byStatus, { open: 2, accepted: 1, dismissed: 1 })
  assert.equal(report.summary.complianceScore, 79)
  assert.equal(report.findings[0].evidence.title, 'Avoid superlatives')
  assert.equal(report.findings[1].evidence.title, 'Twenty million accounts')
  assert.equal(report.findings[1].evidence.sourceName, 'Annual report')
  assert.equal(report.findings[2].evidence.title, 'Long sentence')
  assert.equal(report.findings[3].source, 'ai')
  assert.deepEqual(report.generatedBy, { name: 'Morgan', role: 'approver' })
  assert.equal(report.approval.decidedBy.name, 'Ari Approver')
})

test('report title lookup uses the review brand when codes collide', () => {
  const brandA = new mongoose.Types.ObjectId()
  const brandB = new mongoose.Types.ObjectId()
  const makeReview = (brand) => ({ ...sampleReview(), brand, findings: [sampleReview().findings[0]] })
  const rules = [{ brand: brandA, code: 'TERM-01', title: 'Brand A rule' }, { brand: brandB, code: 'TERM-01', title: 'Brand B rule' }]
  const a = buildReport({ review: makeReview(brandA), rules }).findings[0].evidence.title
  const b = buildReport({ review: makeReview(brandB), rules }).findings[0].evidence.title
  assert.equal(a, 'Brand A rule')
  assert.equal(b, 'Brand B rule')
})

test('report fingerprint is stable and changes with finding status or decision', () => {
  const review = sampleReview()
  const fingerprint = buildReport({ review }).fingerprint
  assert.equal(buildReport({ review }).fingerprint, fingerprint)
  const changedFinding = { ...review, findings: review.findings.map((finding, index) => index ? finding : { ...finding, status: 'accepted' }) }
  assert.notEqual(buildReport({ review: changedFinding }).fingerprint, fingerprint)
  assert.notEqual(buildReport({ review: { ...review, workflowStatus: 'changes_requested', decidedAt: new Date('2026-10-02') } }).fingerprint, fingerprint)
})

test('report disclosures cover AI, quality, approval, truncation, and finding caps', () => {
  const cases = [
    [{ aiStatus: 'disabled' }, 'AI was not used'],
    [{ aiStatus: 'partial', ai: { chunksAnalysed: 2, chunksTotal: 4 } }, 'AI analysed 2 of 4 sections'],
    [{ qualityChecksRun: false }, 'Readability and accessibility checks were not run'],
    [{ workflowStatus: 'draft' }, 'This review has not been approved'],
    [{ source: { kind: 'document', truncated: true } }, 'The source document text was truncated'],
    [{ findingsTruncated: true }, 'Findings were capped at 1,000'],
  ]
  for (const [override, disclosure] of cases) {
    const report = buildReport({ review: { ...sampleReview(), ...override } })
    assert.ok(report.disclosures.some((item) => item.startsWith(disclosure)))
  }
  assert.ok(buildReport({ review: sampleReview() }).disclosures.includes('Findings are only as complete as the rules and facts library'))
})

test('report omits sensitive user fields and full text unless explicitly requested', () => {
  const review = sampleReview()
  const report = buildReport({ review, generatedBy: user('Morgan', 'reviewer') })
  const serialized = JSON.stringify(report)
  assert.equal(serialized.includes('passwordHash'), false)
  assert.equal(serialized.includes('email'), false)
  assert.equal(serialized.includes('Full source text'), false)
  const full = buildReport({ review, options: { includeFullText: true } })
  assert.equal(full.fullText, review.inputText)
  assert.equal(JSON.stringify(full).includes('passwordHash'), false)
})

test('compliance score matches the existing fixed-weight formula, including an empty review', () => {
  assert.equal(calculateComplianceScore([{ severity: 'high' }, { severity: 'medium' }, { severity: 'low' }, { type: 'needs_verification' }]), 79)
  assert.equal(calculateComplianceScore([]), 100)
  assert.equal(buildReport({ review: { ...sampleReview(), findings: [] } }).summary.complianceScore, 100)
  assert.ok(Number.isFinite(buildReport({ review: { ...sampleReview(), findings: [] } }).summary.complianceScore))
})

test('CSV exports include a UTF-8 BOM, quote embedded punctuation, and neutralize formulas', () => {
  const output = findingsCsv({ findings: [{ number: 1, severity: 'low', type: 'rule_violation', category: 'claims', source: 'rules', evidence: { refCode: 'R-1', title: 'A rule' }, matchedText: 'Claim, "quoted"\nnext', suggestion: '=HYPERLINK("bad")', status: 'open', statusChangedBy: null, statusChangedAt: null, comments: [] }] })
  assert.ok(output.startsWith('\uFEFF'))
  assert.ok(output.includes('"Claim, ""quoted""\nnext"'))
  assert.ok(output.includes("'=HYPERLINK("))
  const summary = summaryCsv([{ brandName: '+cmd', source: 'Pasted text' }])
  assert.ok(summary.includes("'+cmd"))
})

test('report route requires auth and returns 404 or 400 for unknown review and invalid options', async () => {
  assert.equal(reviewsRouter.stack[0].handle, requireAuth)
  const authRes = response()
  await requireAuth({ get: () => undefined }, authRes, () => {})
  assert.equal(authRes.statusCode, 401)
  const originals = Review.findById
  Review.findById = () => ({ populate() { return this }, then(resolve) { resolve(null) } })
  try {
    const missing = response()
    await getReviewReport({ params: { id: new mongoose.Types.ObjectId().toString() }, query: {} }, missing)
    assert.equal(missing.statusCode, 404)
    assert.equal(missing.headers['Cache-Control'], 'no-store')
    const invalid = response()
    await getReviewReport({ params: { id: new mongoose.Types.ObjectId().toString() }, query: { includeAudit: 'yes' } }, invalid)
    assert.equal(invalid.statusCode, 400)
  } finally { Review.findById = originals }
})

test('report route writes exactly one report_exported audit event with options and fingerprint', async () => {
  const originals = { findById: Review.findById, auditFind: AuditLog.find, auditCreate: AuditLog.create, ruleFind: Rule.find, factFind: Fact.find }
  const review = sampleReview()
  const query = { populate() { return this }, then(resolve) { resolve(review) } }
  const entries = []
  Review.findById = () => query
  AuditLog.find = () => ({ select() { return this }, sort() { return this }, limit() { return this }, lean: async () => [] })
  AuditLog.create = async (entry) => { entries.push(entry); return entry }
  Rule.find = () => ({ select() { return this }, lean: async () => [] })
  Fact.find = () => ({ select() { return this }, lean: async () => [] })
  try {
    const res = response()
    await getReviewReport({ params: { id: String(review._id) }, query: { includeComments: 'false' }, user: { _id: new mongoose.Types.ObjectId(), name: 'Morgan', role: 'reviewer' } }, res)
    assert.equal(res.statusCode, 200)
    assert.equal(res.headers['Cache-Control'], 'no-store')
    assert.equal(entries.length, 1)
    assert.equal(entries[0].action, 'report_exported')
    assert.ok(entries[0].note.includes(res.body.fingerprint))
  } finally {
    Review.findById = originals.findById
    AuditLog.find = originals.auditFind
    AuditLog.create = originals.auditCreate
    Rule.find = originals.ruleFind
    Fact.find = originals.factFind
  }
})

test('batch report skips missing ids and rejects more than 25 ids', async () => {
  const originalFind = Review.find
  let queryCount = 0
  const existing = { ...sampleReview(), _id: new mongoose.Types.ObjectId(), createdBy: user('Rae', 'reviewer') }
  Review.find = () => {
    queryCount += 1
    return { select() { return this }, populate() { return this }, lean: async () => [existing] }
  }
  try {
    const missingId = new mongoose.Types.ObjectId().toString()
    const res = response()
    await getReportSummary({ body: { ids: [String(existing._id), missingId] } }, res)
    assert.equal(res.body.rows.length, 1)
    assert.equal(res.body.rows[0].source, 'launch.pdf')
    assert.deepEqual(res.body.missing, [missingId])
    const invalid = response()
    await getReportSummary({ body: { ids: Array.from({ length: 26 }, () => new mongoose.Types.ObjectId().toString()) } }, invalid)
    assert.equal(invalid.statusCode, 400)
    assert.equal(queryCount, 1)
  } finally { Review.find = originalFind }
})
