import jwt from 'jsonwebtoken'
import User from '../models/User.js'

export function signToken(user) {
  return jwt.sign({ role: user.role }, process.env.JWT_SECRET, {
    subject: user.id ?? user._id.toString(),
    expiresIn: process.env.JWT_EXPIRES_IN || '7d',
  })
}

export async function requireAuth(req, res, next) {
  const [scheme, token, extra] = (req.get('authorization') ?? '').split(' ')
  if (scheme !== 'Bearer' || !token || extra) {
    return res.status(401).json({ error: 'Authentication required.' })
  }

  let payload
  try {
    payload = jwt.verify(token, process.env.JWT_SECRET)
  } catch {
    return res.status(401).json({ error: 'Invalid or expired token.' })
  }
  if (!payload || typeof payload !== 'object' || typeof payload.sub !== 'string') {
    return res.status(401).json({ error: 'Invalid or expired token.' })
  }
  const user = await User.findById(payload.sub)
  if (!user) return res.status(401).json({ error: 'Invalid or expired token.' })
  req.user = user
  return next()
}

export function requireRole(...roles) {
  return (req, res, next) => {
    if (!req.user || !roles.includes(req.user.role)) {
      return res.status(403).json({ error: 'Forbidden.' })
    }
    return next()
  }
}
