import AuditLog from '../models/AuditLog.js'

export function recordAudit({ review, user, action, findingId, from, to, matchedText, note }) {
  return AuditLog.create({
    review: review._id ?? review.id,
    actor: user._id ?? user.id,
    actorName: user.name,
    actorRole: user.role,
    action,
    ...(findingId ? { findingId } : {}),
    ...(from !== undefined ? { from } : {}),
    ...(to !== undefined ? { to } : {}),
    ...(matchedText !== undefined ? { matchedText: matchedText.slice(0, 120) } : {}),
    ...(note !== undefined ? { note: note.slice(0, 500) } : {}),
  })
}
