import assert from 'node:assert/strict'
import test from 'node:test'
import { facts, rules, seed } from '../src/seed/seed.js'

function fakeCollection(initial = []) {
  const records = new Map(initial.map((record) => [record.code, record]))
  return {
    records,
    async bulkWrite(operations) {
      for (const operation of operations) {
        const { filter, update, upsert } = operation.updateOne
        assert.equal(upsert, true)
        assert.ok(update.$setOnInsert)
        if (!records.has(filter.code)) records.set(filter.code, update.$setOnInsert)
      }
    },
  }
}

test('seed is additive and repeatable without resetting demo passwords', async () => {
  const existingRule = { code: rules[0].code, title: 'Locally customized rule' }
  const ruleCollection = fakeCollection([existingRule])
  const factCollection = fakeCollection()
  const users = new Map([
    ['approver@nimbusnotes.demo', {
      name: 'Existing approver', email: 'approver@nimbusnotes.demo', role: 'approver', passwordHash: 'existing-hash',
      async save() { users.set(this.email, this) },
    }],
  ])
  let passwordSetCount = 0
  class FakeUser {
    static async findOne({ email }) { return users.get(email) ?? null }
    constructor(data) { Object.assign(this, data) }
    async setPassword(value) { passwordSetCount += 1; this.passwordHash = `hashed:${value}` }
    async save() { users.set(this.email, this) }
  }
  let connects = 0
  const output = []
  const originalPassword = process.env.SEED_DEMO_PASSWORD
  process.env.SEED_DEMO_PASSWORD = 'test-only-seed-password'
  try {
    const dependencies = {
      connect: async (options) => { connects += 1; assert.deepEqual(options, { quiet: true }) },
      ruleModel: ruleCollection,
      factModel: factCollection,
      userModel: FakeUser,
      log: (line) => output.push(line),
    }
    await seed(dependencies)
    await seed(dependencies)
    assert.equal(connects, 2)
    assert.equal(ruleCollection.records.size, rules.length)
    assert.equal(factCollection.records.size, facts.length)
    assert.equal(ruleCollection.records.get(existingRule.code), existingRule)
    assert.equal(users.size, 2)
    assert.equal(passwordSetCount, 1)
    assert.equal(users.get('approver@nimbusnotes.demo').passwordHash, 'existing-hash')
    assert.equal(users.get('reviewer@nimbusnotes.demo').role, 'reviewer')
    assert.equal(users.get('approver@nimbusnotes.demo').role, 'approver')
    assert.deepEqual(output, [
      'reviewer@nimbusnotes.demo reviewer',
      'approver@nimbusnotes.demo approver',
      'reviewer@nimbusnotes.demo reviewer',
      'approver@nimbusnotes.demo approver',
    ])
    assert.ok(output.every((line) => !line.includes('test-only-seed-password')))
  } finally {
    if (originalPassword === undefined) delete process.env.SEED_DEMO_PASSWORD
    else process.env.SEED_DEMO_PASSWORD = originalPassword
  }
})

test('production seed requires its configured demo password', async () => {
  const originalNodeEnv = process.env.NODE_ENV
  const originalPassword = process.env.SEED_DEMO_PASSWORD
  process.env.NODE_ENV = 'production'
  delete process.env.SEED_DEMO_PASSWORD
  let connected = false
  try {
    await assert.rejects(seed({ connect: async () => { connected = true } }), /SEED_DEMO_PASSWORD must be set/)
    assert.equal(connected, false)
  } finally {
    if (originalNodeEnv === undefined) delete process.env.NODE_ENV
    else process.env.NODE_ENV = originalNodeEnv
    if (originalPassword === undefined) delete process.env.SEED_DEMO_PASSWORD
    else process.env.SEED_DEMO_PASSWORD = originalPassword
  }
})
