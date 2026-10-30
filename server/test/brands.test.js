import assert from 'node:assert/strict'
import test from 'node:test'
import Rule from '../src/models/Rule.js'
import Fact from '../src/models/Fact.js'
import LibraryChange from '../src/models/LibraryChange.js'
import { nextFreeCode } from '../src/services/library.js'
import { validateFact, validateRule } from '../src/routes/libraryRoutes.js'
import { transition } from '../src/routes/libraryRoutes.js'
import mongoose from 'mongoose'
import { validateAIItems } from '../src/services/ai/aiAnalyzer.js'
import { migrateBrands } from '../src/services/migrateBrands.js'

test('Rule and Fact indexes scope unique codes to a brand', () => {
  for (const Model of [Rule, Fact]) {
    const unique = Model.schema.indexes().find(([fields, options]) => options.unique && fields.brand === 1 && fields.code === 1)
    assert.ok(unique)
    assert.equal(Model.schema.path('status').defaultValue, 'active')
  }
  assert.equal(Rule.schema.path('code').options.unique, undefined)
  assert.equal(Fact.schema.path('code').options.unique, undefined)
})

test('nextFreeCode chooses the first available number for a prefix', () => {
  assert.equal(nextFreeCode('TERM', ['TERM-01', 'TERM-02', 'TERM-04']), 'TERM-3')
  assert.equal(nextFreeCode('FACT', []), 'FACT-1')
  assert.throws(() => nextFreeCode('1A', []), /prefix/)
})

test('rule validation rejects bad codes, missing fields, invalid and catastrophic regexes', () => {
  const base = { code: 'LEGAL-1', title: 'Title', description: 'Description', category: 'legal', type: 'regex_pattern', pattern: '\\bword\\b', severity: 'high', suggestion: 'Rewrite it.' }
  assert.equal(validateRule(base), '')
  assert.match(validateRule({ ...base, code: 'bad' }), /code must match/)
  assert.match(validateRule({ ...base, pattern: '(' }), /compile/)
  assert.match(validateRule({ ...base, pattern: '(a+)+' }), /nested or ambiguous/)
  assert.match(validateRule({ ...base, title: '' }), /title/)
})

test('fact validation rejects non-http sources and missing keywords', () => {
  const base = { code: 'FACT-1', statement: 'A supported product claim.', category: 'product', keywords: ['product'], source: { name: 'Docs', url: 'https://example.com' }, verifiedAt: '2026-01-01' }
  assert.equal(validateFact(base), '')
  assert.match(validateFact({ ...base, source: { ...base.source, url: 'file:///etc/passwd' } }), /http or https/)
  assert.match(validateFact({ ...base, keywords: [] }), /keywords/)
})

test('AI validator rejects codes outside the supplied active brand library', () => {
  const text = 'The copy says best.'
  const template = { matchedText: 'best', type: 'rule_violation', severity: 'high', reason: 'Rule check', suggestion: 'Use a precise claim.' }
  const { findings, dropped } = validateAIItems([
    { ...template, refCode: 'BRAND-B-1' },
    { ...template, refCode: 'DRAFT-1' },
  ], { text, rules: [{ code: 'BRAND-A-1', description: 'Active brand A rule' }], facts: [], deterministicFindings: [] })
  assert.equal(findings.length, 0)
  assert.equal(dropped.length, 2)
})

test('review engine queries only active records for the selected brand', async (t) => {
  const originals = { ruleFind: Rule.find, factFind: Fact.find }
  const brandA = new mongoose.Types.ObjectId()
  const ruleQueries = []
  const factQueries = []
  const dataRules = [
    { brand: brandA, status: 'active', active: true, code: 'TERM-01', type: 'banned_term', values: ['forbidden'], severity: 'high', description: 'No forbidden wording' },
    { brand: brandA, status: 'draft', active: false, code: 'TERM-02', type: 'banned_term', values: ['draftword'], severity: 'high', description: 'Draft' },
    { brand: new mongoose.Types.ObjectId(), status: 'active', active: true, code: 'TERM-03', type: 'banned_term', values: ['otherbrand'], severity: 'high', description: 'Other brand' },
  ]
  Rule.find = (query) => { ruleQueries.push(query); return { lean: async () => dataRules.filter((item) => String(item.brand) === String(query.brand) && item.status === query.status && item.active === query.active) } }
  Fact.find = (query) => { factQueries.push(query); return { lean: async () => [{ brand: brandA, status: 'active', code: 'FACT-01', statement: 'One million accounts', keywords: ['accounts'], value: 1, unit: 'million accounts' }].filter((item) => String(item.brand) === String(query.brand) && item.status === query.status) } }
  t.after(() => { Rule.find = originals.ruleFind; Fact.find = originals.factFind })
  const { runReview } = await import('../src/services/review/reviewEngine.js')
  const result = await runReview({ text: 'This is forbidden, draftword, and otherbrand.', brandName: 'Brand A', brandId: brandA, useAI: false, qualityChecks: false })
  assert.deepEqual(ruleQueries[0], { brand: brandA, status: 'active', active: true })
  assert.deepEqual(factQueries[0], { brand: brandA, status: 'active' })
  assert.deepEqual(new Set(result.findings.map((finding) => finding.evidence.refCode)), new Set(['TERM-01']))
})

test('library lifecycle supports valid transitions and rejects invalid ones', async (t) => {
  const originalCreate = LibraryChange.create
  const entries = []
  LibraryChange.create = async (entry) => { entries.push(entry); return entry }
  t.after(() => { LibraryChange.create = originalCreate })
  const makeModel = (status, createdBy = new mongoose.Types.ObjectId()) => {
    const record = { _id: new mongoose.Types.ObjectId(), brand: new mongoose.Types.ObjectId(), code: 'TERM-01', status, createdBy }
    return { record, findById: async () => record, findOneAndUpdate: async (_filter, update) => Object.assign(record, update.$set) }
  }
  const resFor = () => ({ statusCode: 200, status(code) { this.statusCode = code; return this }, json(body) { this.body = body; return this } })
  const approverId = new mongoose.Types.ObjectId()
  const draft = makeModel('draft')
  let res = resFor()
  await transition({ params: { id: String(draft.record._id) }, body: {}, user: { _id: approverId, name: 'Approver', role: 'approver' } }, res, draft, 'rule', 'approve')
  assert.equal(res.statusCode, 200)
  assert.equal(draft.record.status, 'active')
  assert.equal(entries.at(-1).action, 'approved')
  res = resFor()
  await transition({ params: { id: String(draft.record._id) }, body: {}, user: { _id: approverId, name: 'Approver', role: 'approver' } }, res, draft, 'rule', 'approve')
  assert.equal(res.statusCode, 409)
  const archived = makeModel('active')
  res = resFor()
  await transition({ params: { id: String(archived.record._id) }, body: {}, user: { _id: approverId, name: 'Approver', role: 'approver' } }, res, archived, 'fact', 'archive')
  assert.equal(archived.record.status, 'archived')
  res = resFor()
  await transition({ params: { id: String(archived.record._id) }, body: {}, user: { _id: approverId, name: 'Approver', role: 'approver' } }, res, archived, 'fact', 'unarchive')
  assert.equal(archived.record.status, 'active')
  const rejected = makeModel('draft')
  res = resFor()
  await transition({ params: { id: String(rejected.record._id) }, body: {}, user: { _id: approverId, name: 'Approver', role: 'approver' } }, res, rejected, 'fact', 'reject')
  assert.equal(res.statusCode, 400)
  res = resFor()
  await transition({ params: { id: String(rejected.record._id) }, body: { note: 'Does not match evidence.' }, user: { _id: approverId, name: 'Approver', role: 'approver' } }, res, rejected, 'fact', 'reject')
  assert.equal(rejected.record.status, 'rejected')
  assert.equal(entries.at(-1).action, 'rejected')
})

test('self approval follows ALLOW_SELF_APPROVAL', async (t) => {
  const originalCreate = LibraryChange.create
  const originalSetting = process.env.ALLOW_SELF_APPROVAL
  LibraryChange.create = async (entry) => entry
  t.after(() => { LibraryChange.create = originalCreate; if (originalSetting === undefined) delete process.env.ALLOW_SELF_APPROVAL; else process.env.ALLOW_SELF_APPROVAL = originalSetting })
  const creator = new mongoose.Types.ObjectId()
  const record = { _id: new mongoose.Types.ObjectId(), brand: new mongoose.Types.ObjectId(), code: 'TERM-01', status: 'draft', createdBy: creator }
  const model = { findById: async () => record, findOneAndUpdate: async (_filter, update) => Object.assign(record, update.$set) }
  const res = { statusCode: 200, status(code) { this.statusCode = code; return this }, json(body) { this.body = body; return this } }
  process.env.ALLOW_SELF_APPROVAL = 'false'
  await transition({ params: { id: String(record._id) }, body: {}, user: { _id: creator, name: 'Creator', role: 'approver' } }, res, model, 'rule', 'approve')
  assert.equal(res.statusCode, 403)
  process.env.ALLOW_SELF_APPROVAL = 'true'
  res.statusCode = 200
  await transition({ params: { id: String(record._id) }, body: {}, user: { _id: creator, name: 'Creator', role: 'approver' } }, res, model, 'rule', 'approve')
  assert.equal(record.status, 'active')
})

function migrationDatabase() {
  const state = { mutations: 0, brand: null, pending: { rules: 2, facts: 1, reviews: 3 }, indexes: { rules: [{ name: '_id_' }, { name: 'code_1', unique: true }], facts: [{ name: '_id_' }, { name: 'code_1', unique: true }] } }
  const collections = {}
  for (const name of ['brands', 'rules', 'facts', 'reviews']) {
    collections[name] = {
      async findOne(filter) {
        if (name !== 'brands') return null
        if (filter.isDefault) return state.brand?.isDefault ? state.brand : null
        return state.brand && filter.name.test(state.brand.name) ? state.brand : null
      },
      async countDocuments() { return state.pending[name] ?? 0 },
      async updateOne({ _id }, update) { state.mutations += 1; if (state.brand?._id === _id) Object.assign(state.brand, update.$set) },
      async insertOne(document) { state.mutations += 1; state.brand = { ...document, _id: 'brand-1' }; return { insertedId: 'brand-1' } },
      async updateMany(_filter) { state.mutations += 1; state.pending[name] = 0 },
      async indexes() { return state.indexes[name] ?? [] },
      async dropIndex(indexName) { state.mutations += 1; state.indexes[name] = state.indexes[name].filter((index) => index.name !== indexName) },
      async createIndex(keys, options) { state.mutations += 1; state.indexes[name] ??= []; const indexName = Object.keys(keys).join('_'); if (!state.indexes[name].some((index) => index.name === indexName)) state.indexes[name].push({ name: indexName, unique: options.unique }) },
    }
  }
  return { state, db: { collection: (name) => collections[name] } }
}

test('brand migration dry-run does not mutate data or indexes', async () => {
  const { state, db } = migrationDatabase()
  const counts = await migrateBrands(db, { dryRun: true, makeId: () => 'temporary' })
  assert.deepEqual(counts, { brands: 1, rules: 2, facts: 1, reviews: 3 })
  assert.equal(state.mutations, 0)
  assert.equal(state.brand, null)
  assert.ok(state.indexes.rules.some((index) => index.name === 'code_1'))
})

test('brand migration can be applied twice and drops each old global code index once', async () => {
  const { state, db } = migrationDatabase()
  const first = await migrateBrands(db, { makeId: () => 'new-brand' })
  const second = await migrateBrands(db, { makeId: () => 'unused' })
  assert.deepEqual(first, { brands: 1, rules: 2, facts: 1, reviews: 3 })
  assert.deepEqual(second, { brands: 0, rules: 0, facts: 0, reviews: 0 })
  assert.equal(state.brand.name, 'Nimbus Notes')
  assert.equal(state.brand.isDefault, true)
  for (const collection of ['rules', 'facts']) {
    assert.equal(state.indexes[collection].some((index) => index.name === 'code_1'), false)
    assert.equal(state.indexes[collection].filter((index) => index.name === 'brand_code').length, 1)
  }
})

test('LibraryChange update and delete operations are blocked', async () => {
  await assert.rejects(LibraryChange.updateOne({}, { $set: { action: 'changed' } }), /append-only/)
  await assert.rejects(LibraryChange.deleteOne({}), /append-only/)
})
