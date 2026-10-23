import { Router } from 'express'
import mongoose from 'mongoose'
import Review from '../models/Review.js'
import { runReview } from '../services/review/reviewEngine.js'
import { rateLimit } from 'express-rate-limit'

const router = Router()
const MAX_INPUT_LENGTH = 10_000
const findingStatuses = new Set(['open', 'accepted', 'dismissed'])
const createReviewLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 10,
  standardHeaders: 'draft-8',
  legacyHeaders: false,
  message: { error: 'Too many reviews. Please try again later.' },
})

router.post('/', createReviewLimiter, async (req, res) => {
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
  })

  res.status(201).json(review)
})

router.get('/', async (_req, res) => {
  const reviews = await Review.find()
    .select('brandName createdAt summary')
    .sort({ createdAt: -1 })
    .lean()

  res.json(reviews)
})

router.get('/:id', async (req, res) => {
  if (!mongoose.isValidObjectId(req.params.id)) {
    return res.status(400).json({ error: 'Review id is invalid.' })
  }

  const review = await Review.findById(req.params.id)

  if (!review) {
    return res.status(404).json({ error: 'Review not found.' })
  }

  res.json(review)
})

router.patch('/:id/findings/:findingId', async (req, res) => {
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

  const finding = review.findings.id(findingId)
  if (!finding) {
    return res.status(404).json({ error: 'Finding not found.' })
  }

  finding.status = status
  await review.save()

  res.json(review)
})

export default router
