import assert from 'node:assert/strict'
import mongoose from 'mongoose'
import test from 'node:test'
import AuditLog from '../src/models/AuditLog.js'
import Brand from '../src/models/Brand.js'
import Fact from '../src/models/Fact.js'
import Review from '../src/models/Review.js'
import Rule from '../src/models/Rule.js'
import reviewsRouter, {
  addFindingComment,
  approveReview,
  changeFindingStatus,
  createReview,
  requestReviewChanges,
  submitReview,
} from '../src/routes/reviews.js'
import { requireAuth, requireRole } from '../src/middleware/auth.js'

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
    assert.equal(createdReview.qualityChecksRun, true)
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

test('new reviews without a brand use the default brand and snapshot its name', async (t) => {
  const originals = { readyState: mongoose.connection.readyState, brandFindOne: Brand.findOne, ruleFind: Rule.find, factFind: Fact.find, reviewCreate: Review.create, auditCreate: AuditLog.create }
  const brand = { _id: new mongoose.Types.ObjectId(), name: 'Nimbus Notes' }
  let saved
  mongoose.connection.readyState = 1
  Brand.findOne = async () => brand
  Rule.find = () => ({ lean: async () => [] })
  Fact.find = () => ({ lean: async () => [] })
  Review.create = async (data) => { saved = data; return data }
  AuditLog.create = async (data) => data
  t.after(() => {
    mongoose.connection.readyState = originals.readyState
    Brand.findOne = originals.brandFindOne; Rule.find = originals.ruleFind; Fact.find = originals.factFind
    Review.create = originals.reviewCreate; AuditLog.create = originals.auditCreate
  })
  const res = response()
  await createReview({ body: { inputText: 'A sentence.', useAI: false }, user: { _id: new mongoose.Types.ObjectId(), name: 'Reviewer', role: 'reviewer' } }, res)
  assert.equal(res.statusCode, 201)
  assert.equal(String(saved.brand), String(brand._id))
  assert.equal(saved.brandName, 'Nimbus Notes')
})

test('review creation stores qualityChecks=false and validates its type', async () => {
  const originals = { ruleFind: Rule.find, factFind: Fact.find, reviewCreate: Review.create, auditCreate: AuditLog.create }
  let createdReview
  Rule.find = () => ({ lean: async () => [] })
  Fact.find = () => ({ lean: async () => [] })
  Review.create = async (data) => { createdReview = data; return data }
  AuditLog.create = async (data) => data
  try {
    const res = response()
    await createReview({ body: { inputText: 'A normal sentence.', useAI: false, qualityChecks: false }, user: { _id: new mongoose.Types.ObjectId(), name: 'Reviewer', role: 'reviewer' } }, res)
    assert.equal(res.statusCode, 201)
    assert.equal(createdReview.qualityChecksRun, false)
    const invalid = response()
    await createReview({ body: { inputText: 'Copy.', qualityChecks: 'false' }, user: { _id: new mongoose.Types.ObjectId(), name: 'Reviewer', role: 'reviewer' } }, invalid)
    assert.equal(invalid.statusCode, 400)
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

function mockReview({ status = 'draft', findings = [], submittedBy } = {}) {
  const reviewId = new mongoose.Types.ObjectId()
  const review = {
    _id: reviewId, workflowStatus: status, findings, submittedBy,
    save: async () => {},
    toObject() { return { _id: this._id, workflowStatus: this.workflowStatus, findings: this.findings } },
  }
  for (const finding of findings) finding._id ??= new mongoose.Types.ObjectId()
  return review
}

test('comments store author snapshots and audit, including while pending approval', async () => {
  const originals = { findById: Review.findById, auditCreate: AuditLog.create }
  const finding = { matchedText: 'Claim to review.', comments: [], toObject() { return { ...this } } }
  const review = mockReview({ status: 'pending_approval', findings: [finding] })
  finding.comments.id = undefined
  review.findings.id = (id) => String(finding._id) === String(id) ? finding : null
  const entries = []
  Review.findById = async () => review
  AuditLog.create = async (entry) => { entries.push(entry); return entry }
  try {
    const user = { _id: new mongoose.Types.ObjectId(), name: 'Ari Approver', role: 'approver' }
    const res = response()
    await addFindingComment({ params: { id: String(review._id), findingId: String(finding._id) }, body: { text: '  Please verify this.  ' }, user }, res)
    assert.equal(res.statusCode, 201)
    assert.equal(res.body.authorName, user.name)
    assert.equal(res.body.authorRole, user.role)
    assert.equal(res.body.text, 'Please verify this.')
    assert.equal(entries[0].action, 'comment_added')
    assert.equal(entries[0].findingId, finding._id)
    assert.equal(entries[0].matchedText, finding.matchedText)
    assert.equal(entries[0].note, 'Please verify this.')
  } finally {
    Review.findById = originals.findById
    AuditLog.create = originals.auditCreate
  }
})

test('comment rejects empty and over-length text', async () => {
  const id = new mongoose.Types.ObjectId()
  for (const text of ['', '  ', 'x'.repeat(1001)]) {
    const res = response()
    await addFindingComment({ params: { id: String(id), findingId: String(id) }, body: { text }, user: {} }, res)
    assert.equal(res.statusCode, 400)
  }
})

test('submit blocks open high findings, then submits and audits once resolved', async () => {
  const originals = { findById: Review.findById, update: Review.findOneAndUpdate, auditCreate: AuditLog.create }
  const open = mockReview({ findings: [{ severity: 'high', status: 'open' }] })
  const accepted = mockReview({ findings: [{ severity: 'high', status: 'accepted' }, { severity: 'high', status: 'dismissed' }] })
  let current = open
  const entries = []
  Review.findById = async () => current
  Review.findOneAndUpdate = async (filter, update) => {
    if (filter.workflowStatus && filter.workflowStatus !== current.workflowStatus) return null
    Object.assign(current, update.$set)
    return current
  }
  AuditLog.create = async (entry) => { entries.push(entry); return entry }
  try {
    const blocked = response()
    await submitReview({ params: { id: String(open._id) }, user: { _id: new mongoose.Types.ObjectId(), name: 'R', role: 'reviewer' } }, blocked)
    assert.equal(blocked.statusCode, 409)
    assert.equal(blocked.body.count, 1)
    current = accepted
    const actor = { _id: new mongoose.Types.ObjectId(), name: 'R', role: 'reviewer' }
    const submitted = response()
    await submitReview({ params: { id: String(accepted._id) }, user: actor }, submitted)
    assert.equal(submitted.statusCode, 200)
    assert.equal(accepted.workflowStatus, 'pending_approval')
    assert.equal(String(accepted.submittedBy), String(actor._id))
    assert.equal(entries[0].action, 'review_submitted')
    assert.equal(entries[0].from, 'draft')
    assert.equal(entries[0].to, 'pending_approval')
  } finally {
    Review.findById = originals.findById
    Review.findOneAndUpdate = originals.update
    AuditLog.create = originals.auditCreate
  }
})

test('approve and request-changes enforce approver role; draft approval conflicts', async () => {
  const routeLayers = reviewsRouter.stack.filter((layer) => layer.route)
  for (const path of ['/:id/approve', '/:id/request-changes']) {
    const route = routeLayers.find((layer) => layer.route.path === path).route
    const roleGuard = route.stack[0].handle
    const res = response()
    let next = false
    roleGuard({ user: { role: 'reviewer' } }, res, () => { next = true })
    assert.equal(res.statusCode, 403)
    assert.equal(next, false)
  }
  const oldFind = Review.findById
  const review = mockReview({ status: 'draft' })
  Review.findById = async () => review
  try {
    const res = response()
    await approveReview({ params: { id: String(review._id) }, body: {}, user: { _id: new mongoose.Types.ObjectId() } }, res)
    assert.equal(res.statusCode, 409)
  } finally { Review.findById = oldFind }
})

test('request-changes requires a note and self-approval follows configuration', async () => {
  const originals = { findById: Review.findById, update: Review.findOneAndUpdate, auditCreate: AuditLog.create }
  const oldSetting = process.env.ALLOW_SELF_APPROVAL
  const actorId = new mongoose.Types.ObjectId()
  const review = mockReview({ status: 'pending_approval', submittedBy: actorId })
  const entries = []
  Review.findById = async () => review
  Review.findOneAndUpdate = async (_filter, update) => { Object.assign(review, update.$set); return review }
  AuditLog.create = async (entry) => { entries.push(entry); return entry }
  const req = (body) => ({ params: { id: String(review._id) }, body, user: { _id: actorId, name: 'A', role: 'approver' } })
  try {
    process.env.ALLOW_SELF_APPROVAL = 'false'
    let res = response()
    await requestReviewChanges(req({}), res)
    assert.equal(res.statusCode, 400)
    res = response()
    await approveReview(req({}), res)
    assert.equal(res.statusCode, 403)
    process.env.ALLOW_SELF_APPROVAL = 'true'
    res = response()
    await approveReview(req({ note: 'Looks good' }), res)
    assert.equal(res.statusCode, 200)
    assert.equal(review.workflowStatus, 'approved')
    assert.equal(entries.at(-1).action, 'review_approved')
    assert.equal(entries.at(-1).note, 'Looks good')
  } finally {
    Review.findById = originals.findById
    Review.findOneAndUpdate = originals.update
    AuditLog.create = originals.auditCreate
    if (oldSetting === undefined) delete process.env.ALLOW_SELF_APPROVAL
    else process.env.ALLOW_SELF_APPROVAL = oldSetting
  }
})

test('request changes can be followed by resubmission and decision audit', async () => {
  const originals = { findById: Review.findById, update: Review.findOneAndUpdate, auditCreate: AuditLog.create }
  const review = mockReview({ status: 'pending_approval', findings: [{ severity: 'high', status: 'accepted' }] })
  const entries = []
  Review.findById = async () => review
  Review.findOneAndUpdate = async (_filter, update) => { Object.assign(review, update.$set); return review }
  AuditLog.create = async (entry) => { entries.push(entry); return entry }
  try {
    const approver = { _id: new mongoose.Types.ObjectId(), name: 'A', role: 'approver' }
    const changed = response()
    await requestReviewChanges({ params: { id: String(review._id) }, body: { note: 'Clarify claim' }, user: approver }, changed)
    assert.equal(changed.statusCode, 200)
    assert.equal(review.workflowStatus, 'changes_requested')
    assert.equal(entries[0].action, 'changes_requested')
    review.findings[0].status = 'open'
    assert.equal(review.findings[0].status, 'open')
    review.findings[0].status = 'accepted'
    const submitted = response()
    await submitReview({ params: { id: String(review._id) }, user: { _id: new mongoose.Types.ObjectId(), name: 'R', role: 'reviewer' } }, submitted)
    assert.equal(submitted.statusCode, 200)
    assert.equal(review.workflowStatus, 'pending_approval')
    assert.equal(review.decisionNote, 'Clarify claim')
    assert.equal(entries[1].action, 'review_submitted')
  } finally {
    Review.findById = originals.findById
    Review.findOneAndUpdate = originals.update
    AuditLog.create = originals.auditCreate
  }
})
