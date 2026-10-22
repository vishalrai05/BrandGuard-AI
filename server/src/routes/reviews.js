import { Router } from 'express'
import mongoose from 'mongoose'
import Review from '../models/Review.js'
import { runReview } from '../services/review/reviewEngine.js'

const router = Router()
const MAX_INPUT_LENGTH = 10_000
const findingStatuses = new Set(['open', 'accepted', 'dismissed'])

router.post('/', async (req, res) => {
  const { inputText, brandName } = req.body ?? {}

  if (typeof inputText !== 'string' || !inputText.trim()) {
    return res.status(400).json({ error: 'inputText must be a non-empty string.' })
  }

  if (inputText.length > MAX_INPUT_LENGTH) {
    return res.status(400).json({
      error: `inputText must be ${MAX_INPUT_LENGTH} characters or fewer.`,
    })
  }

  if (brandName !== undefined && (typeof brandName !== 'string' || !brandName.trim())) {
    return res.status(400).json({ error: 'brandName must be a non-empty string when provided.' })
  }

  const reviewBrandName = brandName?.trim() ?? 'Nimbus Notes'
  const { findings, summary } = await runReview({
    text: inputText,
    brandName: reviewBrandName,
  })
  const review = await Review.create({
    inputText,
    brandName: reviewBrandName,
    findings,
    summary,
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
