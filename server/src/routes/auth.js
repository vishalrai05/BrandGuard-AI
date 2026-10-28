import { Router } from 'express'
import { rateLimit } from 'express-rate-limit'
import User from '../models/User.js'
import { requireAuth, signToken } from '../middleware/auth.js'

const router = Router()
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 30,
  standardHeaders: 'draft-8',
  legacyHeaders: false,
  message: { error: 'Too many authentication attempts. Please try again later.' },
})
const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

export async function register(req, res) {
  const { name, email, password } = req.body ?? {}
  if (typeof name !== 'string' || !name.trim() || name.trim().length > 80) {
    return res.status(400).json({ error: 'name must be a non-empty string of at most 80 characters.' })
  }
  if (typeof email !== 'string' || !emailPattern.test(email.trim())) {
    return res.status(400).json({ error: 'A valid email is required.' })
  }
  if (typeof password !== 'string' || password.length < 8) {
    return res.status(400).json({ error: 'password must be at least 8 characters.' })
  }

  const normalizedEmail = email.trim().toLowerCase()
  if (await User.findOne({ email: normalizedEmail })) {
    return res.status(409).json({ error: 'Email already exists.' })
  }

  const user = new User({ name: name.trim(), email: normalizedEmail, role: 'reviewer' })
  await user.setPassword(password)
  try {
    await user.save()
  } catch (error) {
    if (error.code === 11000) return res.status(409).json({ error: 'Email already exists.' })
    throw error
  }
  return res.status(201).json({ token: signToken(user), user: user.toPublic() })
}

export async function login(req, res) {
  const { email, password } = req.body ?? {}
  const user = typeof email === 'string'
    ? await User.findOne({ email: email.trim().toLowerCase() }).select('+passwordHash')
    : null
  if (!user || typeof password !== 'string' || !(await user.checkPassword(password))) {
    return res.status(401).json({ error: 'Invalid email or password.' })
  }
  return res.json({ token: signToken(user), user: user.toPublic() })
}

router.post('/register', authLimiter, register)
router.post('/login', authLimiter, login)
router.get('/me', requireAuth, (req, res) => res.json({ user: req.user.toPublic() }))

export default router
