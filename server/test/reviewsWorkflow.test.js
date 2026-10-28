import assert from 'node:assert/strict'
import mongoose from 'mongoose'
import test from 'node:test'
import AuditLog from '../src/models/AuditLog.js'
import Fact from '../src/models/Fact.js'
import Review from '../src/models/Review.js'
import Rule from '../src/models/Rule.js'
import reviewsRouter, {
  changeFindingStatus,
  createReview,
} from '../src/routes/reviews.js'
import { requireAuth } from '../src/middleware/auth.js'

function response() {
  return {
    statusCode: 200,
    status(code) { this.statusCode = code; return this },
    json(body) { this.body = body; return this },
  }
}

test('creating a review stores its creator and appends review_created', async () => {
  const originals = {
    ruleFind: Rule.find,
    factFind: Fact.find,
    reviewCreate: Review.create,
    auditCreate: AuditLog.create,
  }
  const userId = new mongoose.Types.ObjectId()
  const reviewId = new mongoose.Types.ObjectId()
  let createdReview
  const auditEntries = []
  Rule.find = () => ({ lean: async () => [] })
  Fact.find = () => ({ lean: async () => [] })
  Review.create = async (data) => {
    createdReview = { ...data, _id: reviewId }
    return createdReview
  }
  AuditLog.create = async (data) => { auditEntries.push(data); return data }
  try {
    const res = response()
    await createReview({
      body: { inputText: 'Draft copy.', useAI: false },
      user: { _id: userId, name: 'Rae Reviewer', role: 'reviewer' },
    }, res)
    assert.equal(res.statusCode, 201)
    assert.equal(String(createdReview.createdBy), String(userId))
    assert.equal(auditEntries.length, 1)
    assert.equal(auditEntries[0].action, 'review_created')
    assert.equal(auditEntries[0].actorName, 'Rae Reviewer')
  } finally {
    Rule.find = originals.ruleFind
    Fact.find = originals.factFind
    Review.create = originals.reviewCreate
    AuditLog.create = originals.auditCreate
  }
})

test('changing a finding status appends one audit entry with old and new status', async () => {
  const originalFindById = Review.findById
  const originalAuditCreate = AuditLog.create
  const reviewId = new mongoose.Types.ObjectId()
  const findingId = new mongoose.Types.ObjectId()
  const actorId = new mongoose.Types.ObjectId()
  const finding = { _id: findingId, status: 'open', matchedText: 'Draft claim.' }
  const entries = []
  const review = {
    _id: reviewId,
    workflowStatus: 'draft',
    findings: { id: (id) => String(id) === String(findingId) ? finding : null },
    save: async () => {},
  }
  Review.findById = async () => review
  AuditLog.create = async (entry) => { entries.push(entry); return entry }
  try {
    const res = response()
    await changeFindingStatus({
      params: { id: String(reviewId), findingId: String(findingId) },
      body: { status: 'accepted' },
      user: { _id: actorId, name: 'Rae Reviewer', role: 'reviewer' },
    }, res)
    assert.equal(res.statusCode, 200)
    assert.equal(finding.status, 'accepted')
    assert.equal(entries.length, 1)
    assert.equal(entries[0].from, 'open')
    assert.equal(entries[0].to, 'accepted')
    assert.equal(entries[0].matchedText, 'Draft claim.')

    const same = response()
    await changeFindingStatus({
      params: { id: String(reviewId), findingId: String(findingId) },
      body: { status: 'accepted' },
      user: { _id: actorId, name: 'Rae Reviewer', role: 'reviewer' },
    }, same)
    assert.equal(entries.length, 1)
  } finally {
    Review.findById = originalFindById
    AuditLog.create = originalAuditCreate
  }
})

for (const workflowStatus of ['pending_approval', 'approved']) {
  test(`finding status change is locked for ${workflowStatus} reviews`, async () => {
    const originalFindById = Review.findById
    const reviewId = new mongoose.Types.ObjectId()
    const findingId = new mongoose.Types.ObjectId()
    Review.findById = async () => ({ workflowStatus, findings: { id: () => ({ status: 'open' }) } })
    try {
      const res = response()
      await changeFindingStatus({
        params: { id: String(reviewId), findingId: String(findingId) },
        body: { status: 'accepted' },
        user: { _id: new mongoose.Types.ObjectId(), name: 'Rae Reviewer', role: 'reviewer' },
      }, res)
      assert.equal(res.statusCode, 409)
      assert.match(res.body.error, /locked/)
    } finally {
      Review.findById = originalFindById
    }
  })
}

test('AuditLog update and delete operations throw', async () => {
  await assert.rejects(AuditLog.updateOne({}, { $set: { note: 'changed' } }), /append-only/)
  await assert.rejects(AuditLog.deleteOne({}), /append-only/)
  await assert.rejects(AuditLog.deleteMany({}), /append-only/)
})

test('review router applies authentication before every endpoint', async () => {
  assert.equal(reviewsRouter.stack[0].handle, requireAuth)
  const res = response()
  let called = false
  await requireAuth({ get: () => undefined }, res, () => { called = true })
  assert.equal(res.statusCode, 401)
  assert.equal(called, false)
})
