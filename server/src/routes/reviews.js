import { Router } from 'express'
import mongoose from 'mongoose'
import Review from '../models/Review.js'
import { runReview } from '../services/review/reviewEngine.js'
import { requireAuth } from '../middleware/auth.js'
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
    .select('brandName createdAt summary createdBy workflowStatus')
    .populate('createdBy', 'name')
    .sort({ createdAt: -1 })
    .lean()

  return res.json(reviews.map((review) => ({
    ...review,
    createdBy: review.createdBy
      ? { id: String(review.createdBy._id), name: review.createdBy.name }
      : null,
    workflowStatus: review.workflowStatus ?? 'draft',
  })))
}

export async function getReview(req, res) {
  if (!mongoose.isValidObjectId(req.params.id)) {
    return res.status(400).json({ error: 'Review id is invalid.' })
  }

  const review = await Review.findById(req.params.id)

  if (!review) {
    return res.status(404).json({ error: 'Review not found.' })
  }

  return res.json(review)
}

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
router.patch('/:id/findings/:findingId', changeFindingStatus)

export default router
