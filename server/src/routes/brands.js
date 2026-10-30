import { Router } from 'express'
import mongoose from 'mongoose'
import Brand from '../models/Brand.js'
import Rule from '../models/Rule.js'
import Fact from '../models/Fact.js'
import Review from '../models/Review.js'
import LibraryChange from '../models/LibraryChange.js'
import IngestionRun from '../models/IngestionRun.js'
import { rateLimit, ipKeyGenerator } from 'express-rate-limit'
import { requireAuth, requireRole } from '../middleware/auth.js'
import { slugBase, logLibraryChange, nextFreeCode } from '../services/library.js'
import { draftFromGuideline } from '../services/ingestion/draftFromGuideline.js'
import { getDocumentLimits, sanitizeDocumentFilename } from '../config/documents.js'

const router = Router()
router.use(requireAuth)
export function createIngestionLimiter({ windowMs = 60 * 60 * 1000, limit = 5 } = {}) {
  return rateLimit({
  windowMs,
  limit,
  standardHeaders: 'draft-8',
  legacyHeaders: false,
  keyGenerator: (req) => String(req.user?._id ?? req.user?.id ?? ipKeyGenerator(req.ip)),
  message: { error: 'You have reached the guideline import limit. Please try again in an hour.' },
  })
}
export const ingestionLimiter = createIngestionLimiter()

router.get('/', async (_req, res) => {
  const brands = await Brand.find().sort({ isDefault: -1, name: 1 }).lean()
  const result = await Promise.all(brands.map(async (brand) => {
    const [activeRules, activeFacts, draftItems, reviews] = await Promise.all([
      Rule.countDocuments({ brand: brand._id, status: 'active' }), Fact.countDocuments({ brand: brand._id, status: 'active' }),
      Promise.all([Rule.countDocuments({ brand: brand._id, status: 'draft' }), Fact.countDocuments({ brand: brand._id, status: 'draft' })]).then((values) => values.reduce((a, b) => a + b, 0)),
      Review.countDocuments({ brand: brand._id }),
    ])
    return { ...brand, counts: { activeRules, activeFacts, draftItems, reviews } }
  }))
  return res.json(result)
})

router.post('/', requireRole('approver'), async (req, res) => {
  const name = typeof req.body?.name === 'string' ? req.body.name.trim() : ''
  const description = typeof req.body?.description === 'string' ? req.body.description.trim() : ''
  if (name.length < 2 || name.length > 60 || description.length > 300) return res.status(400).json({ error: 'name must be 2 to 60 characters and description no more than 300 characters.' })
  if (await Brand.findOne({ name: new RegExp(`^${name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`, 'i') })) return res.status(409).json({ error: 'A brand with this name already exists.' })
  const base = slugBase(name)
  let slug = base
  for (let suffix = 2; await Brand.exists({ slug }); suffix += 1) slug = `${base}-${suffix}`
  const brand = await Brand.create({ name, description, slug, createdBy: req.user._id ?? req.user.id })
  await logLibraryChange({ brand: brand._id, entityType: 'brand', entity: brand, user: req.user, action: 'created' })
  return res.status(201).json(brand)
})

router.patch('/:id', requireRole('approver'), async (req, res) => {
  if (!mongoose.isValidObjectId(req.params.id)) return res.status(400).json({ error: 'Brand id is invalid.' })
  const brand = await Brand.findById(req.params.id)
  if (!brand) return res.status(404).json({ error: 'Brand not found.' })
  const changedFields = []
  if (req.body?.name !== undefined) {
    if (typeof req.body.name !== 'string' || req.body.name.trim().length < 2 || req.body.name.trim().length > 60) return res.status(400).json({ error: 'name must be 2 to 60 characters.' })
    const name = req.body.name.trim()
    if (await Brand.findOne({ _id: { $ne: brand._id }, name: new RegExp(`^${name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`, 'i') })) return res.status(409).json({ error: 'A brand with this name already exists.' })
    brand.name = name; changedFields.push('name')
  }
  if (req.body?.description !== undefined) {
    if (typeof req.body.description !== 'string' || req.body.description.trim().length > 300) return res.status(400).json({ error: 'description must be no more than 300 characters.' })
    brand.description = req.body.description.trim(); changedFields.push('description')
  }
  if (!changedFields.length) return res.status(400).json({ error: 'Provide a name or description to update.' })
  await brand.save()
  // Review brandName is an immutable display snapshot; older reports and history keep the original name.
  await logLibraryChange({ brand: brand._id, entityType: 'brand', entity: brand, user: req.user, action: 'edited', changedFields })
  return res.json(brand)
})

router.get('/:id/library-log', async (req, res) => {
  if (!mongoose.isValidObjectId(req.params.id)) return res.status(400).json({ error: 'Brand id is invalid.' })
  const limit = Number(req.query.limit ?? 25); const page = Number(req.query.page ?? 1)
  if (!Number.isInteger(limit) || limit < 1 || limit > 100 || !Number.isInteger(page) || page < 1) return res.status(400).json({ error: 'limit must be 1-100 and page must be a positive integer.' })
  if (!await Brand.exists({ _id: req.params.id })) return res.status(404).json({ error: 'Brand not found.' })
  const entries = await LibraryChange.find({ brand: req.params.id }).sort({ createdAt: -1, _id: -1 }).skip((page - 1) * limit).limit(limit).lean()
  return res.json(entries)
})

export async function getSetupStatus(req, res) {
  if (!mongoose.isValidObjectId(req.params.id)) return res.status(400).json({ error: 'Brand id is invalid.' })
  const brand = await Brand.findById(req.params.id).select('_id name').lean()
  if (!brand) return res.status(404).json({ error: 'Brand not found.' })
  const [guidelineImported, ruleDrafts, factDrafts, activeRules, activeFacts, reviewsCount] = await Promise.all([
    IngestionRun.exists({ brand: brand._id }), Rule.countDocuments({ brand: brand._id, status: 'draft' }), Fact.countDocuments({ brand: brand._id, status: 'draft' }),
    Rule.countDocuments({ brand: brand._id, status: 'active' }), Fact.countDocuments({ brand: brand._id, status: 'active' }), Review.countDocuments({ brand: brand._id }),
  ])
  const draftCount = ruleDrafts + factDrafts
  const hasApprovedItems = activeRules + activeFacts > 0
  const steps = [
    { id: 'brand', title: 'Create brand', status: 'done', href: null },
    { id: 'guideline', title: 'Import guidelines', status: guidelineImported ? 'done' : 'current', href: 'import' },
    { id: 'approve', title: 'Approve rules and facts', status: hasApprovedItems ? 'done' : guidelineImported ? 'current' : 'todo', href: 'drafts' },
    { id: 'review', title: 'Run first review', status: reviewsCount > 0 ? 'done' : hasApprovedItems ? 'current' : 'todo', href: '/' },
  ]
  return res.json({ hasBrand: true, guidelineImported: Boolean(guidelineImported), draftCount, activeRules, activeFacts, reviewsCount, steps })
}

export async function ingestGuideline(req, res, { draft = draftFromGuideline } = {}) {
  if (!mongoose.isValidObjectId(req.params.id)) return res.status(400).json({ error: 'Brand id is invalid.' })
  const { text, filename } = req.body ?? {}
  const { maxDocChars } = getDocumentLimits()
  if (typeof text !== 'string' || !text.trim()) return res.status(400).json({ error: 'text must be a non-empty string.' })
  if (text.length > maxDocChars) return res.status(400).json({ error: `Guideline text must be no more than ${maxDocChars} characters.` })
  if (filename !== undefined && typeof filename !== 'string') return res.status(400).json({ error: 'filename must be a string.' })
  const safeFilename = sanitizeDocumentFilename(filename || 'pasted-guideline.txt') || 'pasted-guideline.txt'
  const brand = await Brand.findById(req.params.id).select('_id name').lean()
  if (!brand) return res.status(404).json({ error: 'Brand not found.' })
  const [existingRules, existingFacts] = await Promise.all([
    Rule.find({ brand: brand._id }).select('code title description category type values pattern status').lean(),
    Fact.find({ brand: brand._id }).select('code statement category status').lean(),
  ])
  const drafted = await draft({ text, filename: safeFilename, brand, existingRules, existingFacts })
  if (drafted.status === 'failed') return res.status(503).json({ error: 'The guideline could not be analysed. The AI service may be unavailable; no drafts were saved.' })
  const actor = req.user._id ?? req.user.id
  const run = await IngestionRun.create({
    brand: brand._id,
    createdBy: { id: actor, name: req.user.name, role: req.user.role },
    filename: safeFilename,
    charCount: text.length,
    chunksTotal: drafted.chunksTotal,
    chunksAnalysed: drafted.chunksAnalysed,
    status: drafted.status,
    counts: { rulesDrafted: drafted.rules.length, factsDrafted: drafted.facts.length, dropped: drafted.dropped },
  })
  const persistedRules = drafted.rules.map((rule) => ({ ...rule, brand: brand._id, status: 'draft', active: false, origin: 'ai_draft', sourceDocument: safeFilename, ingestionRun: run._id, createdBy: actor }))
  const persistedFacts = drafted.facts.map((fact) => ({ ...fact, brand: brand._id, status: 'draft', origin: 'ai_draft', sourceDocument: safeFilename, ingestionRun: run._id, createdBy: actor }))
  try {
    const [rules, facts] = await Promise.all([Rule.insertMany(persistedRules), Fact.insertMany(persistedFacts)])
    for (const entity of rules) await logLibraryChange({ brand: brand._id, entityType: 'rule', entity, user: req.user, action: 'created', note: `AI draft from ${safeFilename}` })
    for (const entity of facts) await logLibraryChange({ brand: brand._id, entityType: 'fact', entity, user: req.user, action: 'created', note: `AI draft from ${safeFilename}` })
    const status = drafted.status
    const message = status === 'partial' ? 'Some guideline sections could not be analysed or were over the configured limit. Review the drafts and dropped-item reasons below.' : 'Guideline analysed. These suggestions are drafts and must be approved before reviews can use them.'
    return res.status(201).json({ run, rules, facts, dropped: drafted.dropped, status, message })
  } catch (error) {
    await Promise.all([Rule.deleteMany({ ingestionRun: run._id }), Fact.deleteMany({ ingestionRun: run._id }), IngestionRun.deleteOne({ _id: run._id })])
    console.error('Guideline draft persistence failed.')
    return res.status(500).json({ error: 'Drafts could not be saved. Please retry the guideline import.' })
  }
}

export async function getIngestionRuns(req, res) {
  if (!mongoose.isValidObjectId(req.params.id)) return res.status(400).json({ error: 'Brand id is invalid.' })
  const page = Number(req.query.page ?? 1)
  const limit = Number(req.query.limit ?? 20)
  if (!Number.isInteger(page) || page < 1 || !Number.isInteger(limit) || limit < 1 || limit > 100) return res.status(400).json({ error: 'page must be positive and limit must be 1-100.' })
  if (!await Brand.exists({ _id: req.params.id })) return res.status(404).json({ error: 'Brand not found.' })
  const filter = { brand: req.params.id }
  const [runs, total] = await Promise.all([IngestionRun.find(filter).sort({ createdAt: -1, _id: -1 }).skip((page - 1) * limit).limit(limit).lean(), IngestionRun.countDocuments(filter)])
  return res.json({ runs, page, limit, total, pages: Math.ceil(total / limit) })
}

router.get('/:id/setup-status', getSetupStatus)
router.post('/:id/ingest', ingestionLimiter, ingestGuideline)
router.get('/:id/ingestion-runs', getIngestionRuns)

export default router
