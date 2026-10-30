import { Router } from 'express'
import mongoose from 'mongoose'
import Review from '../models/Review.js'
import Rule from '../models/Rule.js'
import Fact from '../models/Fact.js'
import Brand from '../models/Brand.js'
import { requireAuth } from '../middleware/auth.js'
import { buildInsights } from '../services/insights/buildInsights.js'
import { getQualityConfig } from '../services/review/qualityChecks.js'

const router = Router()
const REVIEW_CAP = 2000
const DAY_MS = 24 * 60 * 60 * 1000
router.use(requireAuth)

function escapeRegex(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

function parseQuery(req, res) {
  const rawDays = req.query.days ?? '30'
  const days = typeof rawDays === 'string' && /^\d+$/.test(rawDays) ? Number(rawDays) : NaN
  if (!Number.isInteger(days) || days < 1 || days > 365) {
    res.status(400).json({ error: 'days must be an integer between 1 and 365.' })
    return null
  }
  const scope = req.query.scope ?? 'all'
  if (scope !== 'all' && scope !== 'mine') {
    res.status(400).json({ error: 'scope must be either all or mine.' })
    return null
  }
  let brand
  if (req.query.brand !== undefined) {
    if (typeof req.query.brand !== 'string' || !req.query.brand.trim()) {
      res.status(400).json({ error: 'brand must be a non-empty string when provided.' })
      return null
    }
    brand = req.query.brand.trim()
  }
  return { days, scope, brand }
}

async function buildTitleLookup() {
  const [rules, facts] = await Promise.all([
    Rule.find({ status: 'active' }).select('brand code title').lean(),
    Fact.find({ status: 'active' }).select('brand code statement').lean(),
  ])
  const brands = mongoose.connection.readyState === 1 ? await Brand.find().select('_id name isDefault').lean() : []
  const nameById = new Map(brands.map((brand) => [String(brand._id), `name:${brand.name.toLocaleLowerCase()}`]))
  const titles = new Map()
  for (const rule of rules) {
    if (rule.brand) {
      titles.set(`${String(rule.brand)}|${rule.code}`, rule.title)
      titles.set(`${nameById.get(String(rule.brand))}|${rule.code}`, rule.title)
    } else titles.set(rule.code, rule.title)
  }
  for (const fact of facts) {
    if (fact.brand) {
      titles.set(`${String(fact.brand)}|${fact.code}`, fact.statement)
      titles.set(`${nameById.get(String(fact.brand))}|${fact.code}`, fact.statement)
    } else titles.set(fact.code, fact.statement)
  }
  for (const [code, title] of Object.entries(getQualityConfig().titles)) titles.set(code, title)
  return titles
}

export async function getInsights(req, res) {
  const query = parseQuery(req, res)
  if (!query) return

  const to = new Date()
  const from = new Date(to.getTime() - query.days * DAY_MS)
  const filter = { createdAt: { $gte: from, $lte: to } }
  if (query.scope === 'mine') filter.createdBy = req.user._id ?? req.user.id
  if (query.brand) filter.brandName = new RegExp(`^${escapeRegex(query.brand)}$`, 'i')

  const [reviews, titleLookup] = await Promise.all([
    Review.find(filter)
      .select({
        createdAt: 1,
        createdBy: 1,
        brandName: 1,
        brand: 1,
        workflowStatus: 1,
        submittedAt: 1,
        decidedAt: 1,
        'summary.readability': 1,
        'findings.type': 1,
        'findings.severity': 1,
        'findings.status': 1,
        'findings.matchedText': 1,
        'findings.evidence.refCode': 1,
        'findings.evidence.kind': 1,
        'findings.category': 1,
        'findings.source': 1,
      })
      .sort({ createdAt: -1 })
      .limit(REVIEW_CAP)
      .lean(),
    buildTitleLookup(),
  ])
  const days = (to.getTime() - from.getTime()) / DAY_MS
  const insights = buildInsights(reviews, {
    from,
    to,
    bucket: days <= 31 ? 'day' : 'week',
    titleLookup,
  })
  return res.json({ ...insights, truncated: reviews.length === REVIEW_CAP })
}

export async function getInsightBrands(_req, res) {
  const brands = await Review.aggregate([
    { $match: { brandName: { $type: 'string', $ne: '' } } },
    { $group: { _id: '$brandName', count: { $sum: 1 } } },
    { $sort: { _id: 1 } },
    { $project: { _id: 0, brandName: '$_id', count: 1 } },
  ])
  return res.json(brands)
}

router.get('/', getInsights)
router.get('/brands', getInsightBrands)

export default router
