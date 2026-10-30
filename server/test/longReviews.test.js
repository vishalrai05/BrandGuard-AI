import assert from 'node:assert/strict'
import { performance } from 'node:perf_hooks'
import mongoose from 'mongoose'
import test from 'node:test'
import AuditLog from '../src/models/AuditLog.js'
import Fact from '../src/models/Fact.js'
import Review from '../src/models/Review.js'
import Rule from '../src/models/Rule.js'
import { createReview } from '../src/routes/reviews.js'
import { MAX_FINDINGS, runReview } from '../src/services/review/reviewEngine.js'

function response() {
  return { statusCode: 200, status(code) { this.statusCode = code; return this }, json(body) { this.body = body; return this } }
}

function mockLibraries(t, rules = [], facts = []) {
  const originalRuleFind = Rule.find
  const originalFactFind = Fact.find
  Rule.find = () => ({ lean: async () => rules.map((rule) => ({ active: true, ...rule })) })
  Fact.find = () => ({ lean: async () => facts })
  t.after(() => { Rule.find = originalRuleFind; Fact.find = originalFactFind })
}

test('deterministic review stays fast and keeps offsets exact at 60,000 characters', async (t) => {
  mockLibraries(t, [{ code: 'TERM-LONG', type: 'banned_term', category: 'terminology', severity: 'medium', values: ['NimbusNotes'], description: 'Use approved spelling.' }])
  const prefix = 'Nimbus Notes helps teams organize work. '.repeat(1_400)
  const finalSentence = 'NimbusNotes helps teams organize work.'
  const text = `${prefix}${finalSentence}`.padEnd(60_000, ' ')
  assert.equal(text.length, 60_000)
  const started = performance.now()
  const result = await runReview({ text, brandName: 'Nimbus Notes', useAI: false, qualityChecks: false })
  const elapsed = performance.now() - started
  const finding = result.findings[0]
  assert.ok(elapsed < 2_000, `60,000-character deterministic review took ${elapsed.toFixed(1)}ms`)
  assert.equal(finding.startIndex, text.indexOf('NimbusNotes'))
  assert.equal(text.slice(finding.startIndex, finding.endIndex), finding.matchedText)
})

test('review stores validated document source and permits MAX_DOC_CHARS text', async (t) => {
  mockLibraries(t)
  const originalCreate = Review.create
  const originalAuditCreate = AuditLog.create
  const userId = new mongoose.Types.ObjectId()
  let saved
  Review.create = async (value) => { saved = { ...value, _id: new mongoose.Types.ObjectId() }; return saved }
  AuditLog.create = async (entry) => entry
  t.after(() => { Review.create = originalCreate; AuditLog.create = originalAuditCreate })

  const previousLimit = process.env.MAX_DOC_CHARS
  process.env.MAX_DOC_CHARS = '60000'
  t.after(() => previousLimit === undefined ? delete process.env.MAX_DOC_CHARS : process.env.MAX_DOC_CHARS = previousLimit)
  const res = response()
  await createReview({
    body: {
      inputText: 'a'.repeat(60_000), brandName: 'Nimbus Notes', useAI: false, qualityChecks: false,
      source: { kind: 'document', filename: 'C:\\private\\guide.docx', fileType: 'docx', pageCount: null, charCount: 60_000, truncated: false },
    },
    user: { _id: userId, name: 'Rae Reviewer', role: 'reviewer' },
  }, res)
  assert.equal(res.statusCode, 201)
  assert.equal(saved.inputText.length, 60_000)
  assert.deepEqual(saved.source, { kind: 'document', filename: 'guide.docx', fileType: 'docx', pageCount: null, charCount: 60_000, truncated: false })
})

test('pasted text over 10,000 characters and malformed source metadata return 400', async () => {
  const tooLong = response()
  await createReview({ body: { inputText: 'x'.repeat(10_001) }, user: { _id: new mongoose.Types.ObjectId() } }, tooLong)
  assert.equal(tooLong.statusCode, 400)
  const invalid = response()
  await createReview({ body: { inputText: 'valid copy', source: { kind: 'document', filename: 'guide.pdf', fileType: 'exe', pageCount: 1, charCount: 10, truncated: false } }, user: { _id: new mongoose.Types.ObjectId() } }, invalid)
  assert.equal(invalid.statusCode, 400)
})

test('review caps findings at 1,000 by severity then position and reports the total', async (t) => {
  mockLibraries(t, [
    { code: 'LOW-TERM', type: 'banned_term', category: 'terminology', severity: 'low', values: ['bad'], description: '' },
    { code: 'HIGH-TERM', type: 'banned_term', category: 'claims', severity: 'high', values: ['good'], description: '' },
  ])
  const text = 'bad good '.repeat(600)
  const result = await runReview({ text, brandName: 'Nimbus Notes', useAI: false, qualityChecks: false })
  assert.equal(result.findings.length, MAX_FINDINGS)
  assert.equal(result.findingsTruncated, true)
  assert.equal(result.summary.totalDetected, 1_200)
  assert.equal(result.summary.total, 1_200)
  assert.equal(result.findings.filter((finding) => finding.severity === 'high').length, 600)
  assert.equal(result.findings.filter((finding) => finding.severity === 'low').length, 400)
  assert.deepEqual(result.findings.map((finding) => finding.startIndex), [...result.findings.map((finding) => finding.startIndex)].sort((a, b) => a - b))
})
