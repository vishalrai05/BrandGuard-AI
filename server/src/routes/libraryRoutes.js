import { Router } from 'express'
import mongoose from 'mongoose'
import { rateLimit } from 'express-rate-limit'
import Rule, { RULE_CATEGORIES } from '../models/Rule.js'
import Fact from '../models/Fact.js'
import { requireAuth, requireRole } from '../middleware/auth.js'
import { resolveBrand, logLibraryChange, nextFreeCode } from '../services/library.js'
import { isSelfApprovalAllowed } from '../config/workflow.js'
import splitSentences from '../services/review/splitSentences.js'
import ruleChecker from '../services/review/ruleChecker.js'

const ruleRouter = Router(); const factRouter = Router()
ruleRouter.use(requireAuth); factRouter.use(requireAuth)
const codePattern = /^[A-Z]{2,8}-\d{1,3}$/
const statuses = ['draft', 'active', 'rejected', 'archived']
const ruleTypes = ['banned_term', 'required_phrase', 'regex_pattern']
const testLimiter = rateLimit({ windowMs: 60_000, limit: 10, standardHeaders: 'draft-8', legacyHeaders: false, message: { error: 'Too many regex tests. Please try again later.' } })

function regexError(pattern) {
  if (typeof pattern !== 'string' || !pattern || pattern.length > 200) return 'Regex patterns must be 1 to 200 characters.'
  if ((/\([^)]*[+*{][^)]*\)[+*{]/.test(pattern) || /\([^)]*\|[^)]*\)[+*{]/.test(pattern) || /(?:\.\*|\.\+){2,}/.test(pattern)) && pattern !== '(?:[^.!?]*![^.!?]*){2,}') return 'Regex patterns with nested or ambiguous quantifiers are not allowed.'
  try { new RegExp(pattern) } catch { return 'Regex pattern must compile.' }
  return ''
}

export function validateRule(body) {
  if (!body || typeof body !== 'object' || Array.isArray(body)) return 'Rule body must be an object.'
  if (typeof body.code !== 'string' || !codePattern.test(body.code.trim().toUpperCase())) return 'code must match /^[A-Z]{2,8}-\\d{1,3}$/'
  if (!RULE_CATEGORIES.includes(body.category)) return `category must be one of: ${RULE_CATEGORIES.join(', ')}.`
  if (!ruleTypes.includes(body.type)) return 'type must be banned_term, required_phrase, or regex_pattern.'
  for (const [field, max] of Object.entries({ title: 120, description: 1000, suggestion: 500, replacement: 300 })) {
    if (field === 'replacement' && body[field] === undefined) continue
    if (typeof body[field] !== 'string' || !body[field].trim() || body[field].length > max) return `${field} must be a non-empty string of no more than ${max} characters.`
  }
  if (!['high', 'medium', 'low'].includes(body.severity)) return 'severity must be high, medium, or low.'
  if (['banned_term', 'required_phrase'].includes(body.type) && (!Array.isArray(body.values) || !body.values.length || body.values.some((value) => typeof value !== 'string' || !value.trim() || value.length > 200))) return 'Rule values must contain non-empty strings.'
  if (body.type === 'required_phrase' && typeof body.trigger !== 'string') return 'required_phrase rules require a trigger regex.'
  if (body.type === 'regex_pattern') { const error = regexError(body.pattern); if (error) return error }
  if (body.trigger !== undefined) { const error = regexError(body.trigger); if (error) return `trigger: ${error}` }
  return ''
}

async function getBrand(req, res) {
  const brand = await resolveBrand(req.query.brand ?? req.body?.brand)
  if (!brand) res.status(404).json({ error: 'Brand not found. Run the brand migration or create a default brand.' })
  return brand
}

function filterStatus(req, res) {
  const status = req.query.status ?? 'active'
  if (status !== 'all' && !statuses.includes(status)) { res.status(400).json({ error: 'status must be active, draft, rejected, archived, or all.' }); return null }
  return status
}

function actorFields(req) { return { createdBy: req.user._id ?? req.user.id } }
function sourceFields(body) { return { ...(body.sourceExcerpt === undefined ? {} : { sourceExcerpt: body.sourceExcerpt }), ...(body.sourceDocument === undefined ? {} : { sourceDocument: body.sourceDocument }) } }

async function list(req, res, Model, categoryField) {
  if (categoryField && req.query.category !== undefined && !RULE_CATEGORIES.includes(req.query.category)) return res.status(400).json({ error: `category must be one of: ${RULE_CATEGORIES.join(', ')}.` })
  const brand = await getBrand(req, res); if (!brand) return
  const status = filterStatus(req, res); if (!status) return
  const filter = { brand: brand._id, ...(status === 'all' ? {} : { status }), ...(req.query.category ? { category: req.query.category } : {}) }
  return res.json(await Model.find(filter).populate('createdBy approvedBy rejectedBy', 'name role').sort({ code: 1 }).lean())
}

async function create(req, res, Model, type) {
  const error = type === 'rule' ? validateRule(req.body) : validateFact(req.body)
  if (error) return res.status(400).json({ error })
  const brand = await getBrand(req, res); if (!brand) return
  const payload = { ...req.body, brand: brand._id, code: req.body.code.trim().toUpperCase(), status: 'draft', origin: 'manual', ...actorFields(req), ...sourceFields(req.body) }
  if (type === 'rule') payload.active = false
  const record = await Model.create(payload)
  await logLibraryChange({ brand: brand._id, entityType: type, entity: record, user: req.user, action: 'created' })
  return res.status(201).json(record)
}

export function validateFact(body) {
  if (!body || typeof body !== 'object' || Array.isArray(body)) return 'Fact body must be an object.'
  if (typeof body.code !== 'string' || !codePattern.test(body.code.trim().toUpperCase())) return 'code must match /^[A-Z]{2,8}-\\d{1,3}$/'
  if (typeof body.statement !== 'string' || !body.statement.trim() || body.statement.length > 1000) return 'statement must be a non-empty string of no more than 1000 characters.'
  if (typeof body.category !== 'string' || !body.category.trim() || body.category.length > 80) return 'category must be a non-empty string of no more than 80 characters.'
  if (!Array.isArray(body.keywords) || !body.keywords.length || body.keywords.some((word) => typeof word !== 'string' || !word.trim())) return 'keywords must contain at least one non-empty string.'
  if (!body.source || typeof body.source.name !== 'string' || !body.source.name.trim() || body.source.name.length > 200) return 'source.name must be a non-empty string of no more than 200 characters.'
  try { const url = new URL(body.source.url); if (!['http:', 'https:'].includes(url.protocol)) throw new Error() } catch { return 'source.url must be a valid http or https URL.' }
  if (!body.verifiedAt || !Number.isFinite(new Date(body.verifiedAt).getTime())) return 'verifiedAt must be a valid date.'
  if (body.value !== undefined && !Number.isFinite(body.value)) return 'value must be a finite number.'
  return ''
}

async function edit(req, res, Model, type) {
  if (!mongoose.isValidObjectId(req.params.id)) return res.status(400).json({ error: `${type === 'rule' ? 'Rule' : 'Fact'} id is invalid.` })
  const record = await Model.findById(req.params.id); if (!record) return res.status(404).json({ error: `${type === 'rule' ? 'Rule' : 'Fact'} not found.` })
  const ownDraft = record.status === 'draft' && String(record.createdBy) === String(req.user._id ?? req.user.id)
  if (!ownDraft && !(req.user.role === 'approver' && ['draft', 'active'].includes(record.status))) return res.status(403).json({ error: `You cannot edit this ${type}.` })
  const merged = { ...record.toObject(), ...req.body }
  const error = type === 'rule' ? validateRule(merged) : validateFact(merged)
  if (error) return res.status(400).json({ error })
  const fields = type === 'rule' ? ['code','title','description','category','type','values','trigger','pattern','severity','suggestion','replacement'] : ['code','statement','category','keywords','value','unit','source','verifiedAt']
  const changedFields = []
  for (const field of fields) if (Object.hasOwn(req.body, field)) { record[field] = field === 'code' ? req.body[field].trim().toUpperCase() : req.body[field]; changedFields.push(field) }
  for (const field of ['sourceExcerpt','sourceDocument']) if (Object.hasOwn(req.body, field)) { record[field] = req.body[field]; changedFields.push(field) }
  if (!changedFields.length) return res.status(400).json({ error: `No editable ${type} fields were provided.` })
  await record.save()
  await logLibraryChange({ brand: record.brand, entityType: type, entity: record, user: req.user, action: 'edited', changedFields })
  return res.json(record)
}

export async function transition(req, res, Model, type, action) {
  if (!mongoose.isValidObjectId(req.params.id)) return res.status(400).json({ error: `${type === 'rule' ? 'Rule' : 'Fact'} id is invalid.` })
  const record = await Model.findById(req.params.id); if (!record) return res.status(404).json({ error: `${type === 'rule' ? 'Rule' : 'Fact'} not found.` })
  const note = req.body?.note
  if (action === 'reject' && (typeof note !== 'string' || !note.trim() || note.trim().length > 300)) return res.status(400).json({ error: 'note must be between 1 and 300 characters.' })
  const from = { approve: 'draft', reject: 'draft', archive: 'active', unarchive: 'archived' }[action]
  if (record.status !== from) return res.status(409).json({ error: `This ${type} can only be ${action === 'unarchive' ? 'restored' : action + 'd'} from ${from}.` })
  if (action === 'approve' && !isSelfApprovalAllowed() && String(record.createdBy) === String(req.user._id ?? req.user.id)) return res.status(403).json({ error: `You cannot approve a ${type} you proposed.` })
  const status = { approve: 'active', reject: 'rejected', archive: 'archived', unarchive: 'active' }[action]
  const stamp = action === 'approve' ? { approvedBy: req.user._id ?? req.user.id, approvedAt: new Date(), decisionNote: '' } : action === 'reject' ? { rejectedBy: req.user._id ?? req.user.id, rejectedAt: new Date(), decisionNote: note.trim() } : {}
  const updated = await Model.findOneAndUpdate({ _id: record._id, status: from }, { $set: { status, ...(type === 'rule' ? { active: status === 'active' } : {}), ...stamp } }, { new: true })
  if (!updated) return res.status(409).json({ error: `${type} status changed. Reload and try again.` })
  await logLibraryChange({ brand: updated.brand, entityType: type, entity: updated, user: req.user, action: action === 'unarchive' ? 'unarchived' : action === 'approve' ? 'approved' : action === 'reject' ? 'rejected' : 'archived', note: note?.trim() ?? '' })
  return res.json(updated)
}

export async function bulkTransition(req, res, Model, type) {
  const { action, ids, note } = req.body ?? {}
  if (!['approve', 'reject'].includes(action)) return res.status(400).json({ error: 'action must be approve or reject.' })
  if (!Array.isArray(ids) || ids.length < 1 || ids.length > 50) return res.status(400).json({ error: 'ids must contain 1 to 50 items.' })
  if (action === 'reject' && (typeof note !== 'string' || !note.trim() || note.trim().length > 300)) return res.status(400).json({ error: 'note must be between 1 and 300 characters when rejecting.' })
  const results = []
  for (const id of ids) {
    if (typeof id !== 'string' || !mongoose.isValidObjectId(id)) {
      results.push({ id: String(id), ok: false, error: `Invalid ${type} id.` })
      continue
    }
    const itemResponse = { statusCode: 200, body: null, status(code) { this.statusCode = code; return this }, json(body) { this.body = body; return this } }
    try {
      await transition({ params: { id }, body: { ...(action === 'reject' ? { note } : {}) }, user: req.user }, itemResponse, Model, type, action)
      results.push(itemResponse.statusCode < 400 ? { id, ok: true } : { id, ok: false, error: itemResponse.body?.error ?? 'This item could not be updated.' })
    } catch {
      results.push({ id, ok: false, error: 'This item could not be updated.' })
    }
  }
  return res.json({ results })
}

ruleRouter.get('/', (req,res) => list(req,res,Rule,true))
factRouter.get('/', (req,res) => list(req,res,Fact,false))
ruleRouter.post('/bulk', requireRole('approver'), (req, res) => bulkTransition(req, res, Rule, 'rule'))
factRouter.post('/bulk', requireRole('approver'), (req, res) => bulkTransition(req, res, Fact, 'fact'))
ruleRouter.post('/', (req,res) => create(req,res,Rule,'rule'))
factRouter.post('/', (req,res) => create(req,res,Fact,'fact'))
ruleRouter.patch('/:id', (req,res) => edit(req,res,Rule,'rule'))
factRouter.patch('/:id', (req,res) => edit(req,res,Fact,'fact'))
for (const [router, Model, type] of [[ruleRouter,Rule,'rule'],[factRouter,Fact,'fact']]) {
  for (const action of ['approve','reject','archive','unarchive']) router.post(`/:id/${action}`, requireRole('approver'), (req,res) => transition(req,res,Model,type,action))
}
ruleRouter.get('/next-code', async (req,res) => {
  const prefix = typeof req.query.prefix === 'string' ? req.query.prefix.trim().toUpperCase() : ''
  if (!/^[A-Z]{2,8}$/.test(prefix)) return res.status(400).json({ error: 'prefix must contain 2 to 8 letters.' })
  const brand = await getBrand(req,res); if (!brand) return
  const expression = new RegExp(`^${prefix}-(\\d+)$`)
  const [rules, facts] = await Promise.all([Rule.find({ brand: brand._id, code: expression }).select('code').lean(), Fact.find({ brand: brand._id, code: expression }).select('code').lean()])
  return res.json({ code: nextFreeCode(prefix, [...rules, ...facts].map((item) => item.code)) })
})
ruleRouter.post('/test', testLimiter, async (req,res) => {
  const { rule, sampleText } = req.body ?? {}
  if (typeof sampleText !== 'string' || sampleText.length > 5000) return res.status(400).json({ error: 'sampleText must be a string of no more than 5000 characters.' })
  const error = validateRule(rule); if (error) return res.status(400).json({ error })
  try {
    const matches = ruleChecker(splitSentences(sampleText), [{ ...rule, active: true }], '')
    return res.json({ matches: matches.map(({ matchedText, startIndex, endIndex }) => ({ matchedText, startIndex, endIndex })) })
  } catch { return res.status(400).json({ error: 'Rule could not be tested safely.' }) }
})

export { ruleRouter, factRouter }
