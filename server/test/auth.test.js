import assert from 'node:assert/strict'
import test from 'node:test'
import User from '../src/models/User.js'
import { requireAuth, requireRole } from '../src/middleware/auth.js'
import { login, register } from '../src/routes/auth.js'

function response() {
  return {
    statusCode: 200,
    status(code) { this.statusCode = code; return this },
    json(body) { this.body = body; return this },
  }
}

test('register creates a reviewer and stores only a password hash', async () => {
  const oldFindOne = User.findOne
  const oldSave = User.prototype.save
  const oldSecret = process.env.JWT_SECRET
  let saved
  process.env.JWT_SECRET = 'test-secret'
  User.findOne = async () => null
  User.prototype.save = async function () { saved = this }
  try {
    const res = response()
    await register({ body: { name: 'Reviewer', email: 'REVIEWER@example.com', password: 'password123' } }, res)
    assert.equal(res.statusCode, 201)
    assert.equal(res.body.user.role, 'reviewer')
    assert.equal(res.body.user.email, 'reviewer@example.com')
    assert.equal(res.body.user.passwordHash, undefined)
    assert.notEqual(saved.passwordHash, 'password123')
    assert.ok(await saved.checkPassword('password123'))
  } finally {
    User.findOne = oldFindOne
    User.prototype.save = oldSave
    if (oldSecret === undefined) delete process.env.JWT_SECRET
    else process.env.JWT_SECRET = oldSecret
  }
})

test('register ignores a role sent in the body and rejects duplicate email', async () => {
  const oldFindOne = User.findOne
  const oldSave = User.prototype.save
  const oldSecret = process.env.JWT_SECRET
  process.env.JWT_SECRET = 'test-secret'
  User.findOne = async () => null
  User.prototype.save = async function () {}
  try {
    const created = response()
    await register({ body: { name: 'Reviewer', email: 'r@example.com', password: 'password123', role: 'approver' } }, created)
    assert.equal(created.body.user.role, 'reviewer')
    User.findOne = async () => ({})
    const duplicate = response()
    await register({ body: { name: 'Reviewer', email: 'r@example.com', password: 'password123' } }, duplicate)
    assert.equal(duplicate.statusCode, 409)
  } finally {
    User.findOne = oldFindOne
    User.prototype.save = oldSave
    if (oldSecret === undefined) delete process.env.JWT_SECRET
    else process.env.JWT_SECRET = oldSecret
  }
})

test('login returns a token and uses the same generic 401 for bad credentials', async () => {
  const oldFindOne = User.findOne
  const oldSecret = process.env.JWT_SECRET
  process.env.JWT_SECRET = 'test-secret'
  const realUser = new User({ name: 'Reviewer', email: 'r@example.com', role: 'reviewer', passwordHash: 'unused' })
  await realUser.setPassword('password123')
  User.findOne = () => ({ select: async () => realUser })
  try {
    const good = response()
    await login({ body: { email: 'r@example.com', password: 'password123' } }, good)
    assert.equal(good.statusCode, 200)
    assert.ok(good.body.token)
    const wrong = response()
    await login({ body: { email: 'r@example.com', password: 'wrongpass' } }, wrong)
    User.findOne = () => ({ select: async () => null })
    const unknown = response()
    await login({ body: { email: 'missing@example.com', password: 'wrongpass' } }, unknown)
    assert.equal(wrong.statusCode, 401)
    assert.deepEqual(wrong.body, unknown.body)
    assert.equal(wrong.body.error, 'Invalid email or password.')
  } finally {
    User.findOne = oldFindOne
    if (oldSecret === undefined) delete process.env.JWT_SECRET
    else process.env.JWT_SECRET = oldSecret
  }
})

test('/me auth middleware rejects a missing token', async () => {
  let nextCalled = false
  const res = response()
  await requireAuth({ get: () => undefined }, res, () => { nextCalled = true })
  assert.equal(res.statusCode, 401)
  assert.equal(nextCalled, false)
})

test('requireRole rejects a reviewer on an approver-only route', () => {
  let nextCalled = false
  const res = response()
  requireRole('approver')({ user: { role: 'reviewer' } }, res, () => { nextCalled = true })
  assert.equal(res.statusCode, 403)
  assert.equal(nextCalled, false)
})
