import { Router } from 'express'
import mongoose from 'mongoose'
import Review from '../models/Review.js'
import { runReview } from '../services/review/reviewEngine.js'
import { requireAuth, requireRole } from '../middleware/auth.js'
import { isSelfApprovalAllowed } from '../config/workflow.js'
import AuditLog from '../models/AuditLog.js'
import { recordAudit } from '../services/audit.js'
import { rateLimit } from 'express-rate-limit'

const router = Router()
router.use(requireAuth)
const MAX_INPUT_LENGTH = 10_000
const findingStatuses = new Set(['open', 'accepted', 'dismissed'])
const createReviewLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 10,
  standardHeaders: 'draft-8',
  legacyHeaders: false,
  message: { error: 'Too many reviews. Please try again later.' },
})

export async function createReview(req, res) {
  const { inputText, brandName } = req.body ?? {}

  if (typeof inputText !== 'string') {
    return res.status(400).json({ error: 'inputText must be a non-empty string.' })
  }

  const reviewText = inputText.slice(0, MAX_INPUT_LENGTH)
  if (!reviewText.trim()) {
    return res.status(400).json({ error: 'inputText must be a non-empty string.' })
  }

  if (brandName !== undefined && (typeof brandName !== 'string' || !brandName.trim())) {
    return res.status(400).json({ error: 'brandName must be a non-empty string when provided.' })
  }

  if (req.body?.useAI !== undefined && typeof req.body.useAI !== 'boolean') {
    return res.status(400).json({ error: 'useAI must be a boolean when provided.' })
  }

  const reviewBrandName = brandName?.trim() ?? 'Nimbus Notes'
  const { findings, summary, aiStatus, counts } = await runReview({
    text: reviewText,
    brandName: reviewBrandName,
    useAI: req.body?.useAI !== false,
  })
  const review = await Review.create({
    inputText: reviewText,
    brandName: reviewBrandName,
    findings,
    summary,
    aiStatus,
    counts,
    createdBy: req.user._id ?? req.user.id,
  })

  try {
    await recordAudit({ review, user: req.user, action: 'review_created' })
  } catch (error) {
    console.error('Failed to record review_created audit entry:', error)
  }
  return res.status(201).json(review)
}

export async function listReviews(_req, res) {
  const reviews = await Review.find()
    .select('brandName createdAt summary createdBy submittedBy decidedBy workflowStatus decisionNote submittedAt decidedAt')
    .populate('createdBy', 'name role')
    .populate('submittedBy', 'name role')
    .populate('decidedBy', 'name role')
    .sort({ createdAt: -1 })
    .lean()

  return res.json(reviews.map((review) => ({
    ...review,
    createdBy: publicUser(review.createdBy),
    submittedBy: publicUser(review.submittedBy),
    decidedBy: publicUser(review.decidedBy),
    workflowStatus: review.workflowStatus ?? 'draft',
  })))
}

export async function getReview(req, res) {
  if (!mongoose.isValidObjectId(req.params.id)) {
    return res.status(400).json({ error: 'Review id is invalid.' })
  }

  const review = await Review.findById(req.params.id)
    .populate('createdBy', 'name role')
    .populate('submittedBy', 'name role')
    .populate('decidedBy', 'name role')

  if (!review) {
    return res.status(404).json({ error: 'Review not found.' })
  }

  return res.json(publicReview(review))
}

function publicUser(user) {
  return user ? { id: String(user._id ?? user.id), name: user.name, role: user.role } : null
}

function publicReview(review) {
  const value = review.toObject ? review.toObject() : { ...review }
  for (const key of ['createdBy', 'submittedBy', 'decidedBy']) value[key] = publicUser(value[key])
  value.workflowStatus ??= 'draft'
  return value
}

export async function addFindingComment(req, res) {
  const { id, findingId } = req.params
  if (!mongoose.isValidObjectId(id) || !mongoose.isValidObjectId(findingId)) {
    return res.status(400).json({ error: 'Review id or finding id is invalid.' })
  }
  const text = req.body?.text
  if (typeof text !== 'string' || !text.trim() || text.trim().length > 1000) {
    return res.status(400).json({ error: 'text must be between 1 and 1000 characters.' })
  }
  const review = await Review.findById(id)
  if (!review) return res.status(404).json({ error: 'Review not found.' })
  const finding = review.findings.id(findingId)
  if (!finding) return res.status(404).json({ error: 'Finding not found.' })
  const comment = { author: req.user._id ?? req.user.id, authorName: req.user.name, authorRole: req.user.role, text: text.trim(), createdAt: new Date() }
  if (finding.comments?.push) finding.comments.push(comment)
  else finding.comments = [comment]
  await review.save()
  try {
    await recordAudit({ review, user: req.user, action: 'comment_added', findingId: finding._id ?? findingId, matchedText: finding.matchedText, note: comment.text.slice(0, 120) })
  } catch (error) { console.error('Failed to record comment_added audit entry:', error) }
  const saved = finding.comments?.[finding.comments.length - 1] ?? comment
  return res.status(201).json(saved.toObject ? saved.toObject() : saved)
}

export async function submitReview(req, res) {
  const { id } = req.params
  if (!mongoose.isValidObjectId(id)) return res.status(400).json({ error: 'Review id is invalid.' })
  const review = await Review.findById(id)
  if (!review) return res.status(404).json({ error: 'Review not found.' })
  const from = review.workflowStatus ?? 'draft'
  if (!['draft', 'changes_requested'].includes(from)) return res.status(409).json({ error: 'Only draft or changes-requested reviews can be submitted.' })
  const openHighCount = review.findings.filter((finding) => finding.severity === 'high' && finding.status === 'open').length
  if (openHighCount) return res.status(409).json({ error: `Resolve all high-severity findings before submitting. ${openHighCount} remain open.`, count: openHighCount })
  const updated = await Review.findOneAndUpdate(
    review.workflowStatus
      ? { _id: id, workflowStatus: from }
      : { _id: id, $or: [{ workflowStatus: 'draft' }, { workflowStatus: { $exists: false } }] },
    { $set: { workflowStatus: 'pending_approval', submittedBy: req.user._id ?? req.user.id, submittedAt: new Date() } },
    { new: true },
  )
  if (!updated) return res.status(409).json({ error: 'Review workflow status changed. Reload and try again.' })
  try { await recordAudit({ review: updated, user: req.user, action: 'review_submitted', from, to: 'pending_approval' }) }
  catch (error) { console.error('Failed to record review_submitted audit entry:', error) }
  return res.json(publicReview(updated))
}

async function decideReview(req, res, decision) {
  const { id } = req.params
  if (!mongoose.isValidObjectId(id)) return res.status(400).json({ error: 'Review id is invalid.' })
  const note = req.body?.note
  if (decision === 'changes_requested' && (typeof note !== 'string' || !note.trim() || note.trim().length > 500)) {
    return res.status(400).json({ error: 'note must be between 1 and 500 characters.' })
  }
  if (decision === 'approved' && note !== undefined && (typeof note !== 'string' || note.trim().length > 500)) {
    return res.status(400).json({ error: 'note must be no more than 500 characters.' })
  }
  const review = await Review.findById(id)
  if (!review) return res.status(404).json({ error: 'Review not found.' })
  if (review.workflowStatus !== 'pending_approval') return res.status(409).json({ error: 'Only pending-approval reviews can be decided.' })
  const userId = req.user._id ?? req.user.id
  if (!isSelfApprovalAllowed() && review.submittedBy && String(review.submittedBy) === String(userId)) {
    return res.status(403).json({ error: 'You cannot approve or request changes on a review you submitted.' })
  }
  const fields = { workflowStatus: decision, decidedBy: userId, decidedAt: new Date(), decisionNote: note?.trim() ?? '' }
  const updated = await Review.findOneAndUpdate({ _id: id, workflowStatus: 'pending_approval' }, { $set: fields }, { new: true })
  if (!updated) return res.status(409).json({ error: 'Review workflow status changed. Reload and try again.' })
  const action = decision === 'approved' ? 'review_approved' : 'changes_requested'
  try { await recordAudit({ review: updated, user: req.user, action, note: note?.trim() ?? '' }) }
  catch (error) { console.error(`Failed to record ${action} audit entry:`, error) }
  return res.json(publicReview(updated))
}

export async function approveReview(req, res) { return decideReview(req, res, 'approved') }
export async function requestReviewChanges(req, res) { return decideReview(req, res, 'changes_requested') }

export async function changeFindingStatus(req, res) {
  const { id, findingId } = req.params

  if (!mongoose.isValidObjectId(id) || !mongoose.isValidObjectId(findingId)) {
    return res.status(400).json({ error: 'Review id or finding id is invalid.' })
  }

  const { status } = req.body ?? {}
  if (!findingStatuses.has(status)) {
    return res.status(400).json({
      error: 'status must be one of: open, accepted, dismissed.',
    })
  }

  const review = await Review.findById(id)
  if (!review) {
    return res.status(404).json({ error: 'Review not found.' })
  }

  if (!['draft', 'changes_requested'].includes(review.workflowStatus ?? 'draft')) {
    return res.status(409).json({
      error: 'This review is locked while it is pending approval or approved.',
    })
  }

  const finding = review.findings.id(findingId)
  if (!finding) {
    return res.status(404).json({ error: 'Finding not found.' })
  }

  if (finding.status === status) return res.json(review)

  const from = finding.status
  finding.status = status
  finding.statusChangedBy = req.user._id ?? req.user.id
  finding.statusChangedAt = new Date()
  await review.save()

  try {
    await recordAudit({
      review,
      user: req.user,
      action: 'finding_status_changed',
      findingId: finding._id ?? findingId,
      from,
      to: status,
      matchedText: finding.matchedText,
    })
  } catch (error) {
    console.error('Failed to record finding_status_changed audit entry:', error)
  }

  return res.json(review)
}

export async function getReviewAudit(req, res) {
  const { id } = req.params
  if (!mongoose.isValidObjectId(id)) {
    return res.status(400).json({ error: 'Review id is invalid.' })
  }
  const review = await Review.findById(id).select('_id')
  if (!review) return res.status(404).json({ error: 'Review not found.' })

  const limit = Number(req.query.limit ?? 100)
  const page = Number(req.query.page ?? 1)
  if (!Number.isInteger(limit) || limit < 1 || limit > 500 || !Number.isInteger(page) || page < 1) {
    return res.status(400).json({ error: 'limit must be 1-500 and page must be a positive integer.' })
  }
  const entries = await AuditLog.find({ review: id })
    .select('actorName actorRole action from to matchedText note createdAt')
    .sort({ createdAt: 1, _id: 1 })
    .skip((page - 1) * limit)
    .limit(limit)
    .lean()
  return res.json(entries)
}

router.post('/', createReviewLimiter, createReview)
router.get('/', listReviews)
router.get('/:id/audit', getReviewAudit)
router.get('/:id', getReview)
router.post('/:id/findings/:findingId/comments', addFindingComment)
router.patch('/:id/findings/:findingId', changeFindingStatus)
router.post('/:id/submit', submitReview)
router.post('/:id/approve', requireRole('approver'), approveReview)
router.post('/:id/request-changes', requireRole('approver'), requestReviewChanges)

export default router
