import { Router } from 'express'
import Fact from '../models/Fact.js'

const router = Router()

router.get('/', async (_req, res) => {
  const facts = await Fact.find().sort({ code: 1 }).lean()
  res.json(facts)
})

export default router
