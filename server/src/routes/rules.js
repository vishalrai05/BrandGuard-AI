import { Router } from 'express'
import Rule, { RULE_CATEGORIES } from '../models/Rule.js'

const router = Router()

router.get('/', async (req, res) => {
  const { category } = req.query

  if (category !== undefined && !RULE_CATEGORIES.includes(category)) {
    return res.status(400).json({
      error: `category must be one of: ${RULE_CATEGORIES.join(', ')}.`,
    })
  }

  const filter = category ? { category } : {}
  const rules = await Rule.find(filter).sort({ code: 1 }).lean()

  res.json(rules)
})

export default router
