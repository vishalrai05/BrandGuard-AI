import { useState } from 'react'
import { LoaderCircle, MessageSquare, Send } from 'lucide-react'

const relativeTime = new Intl.RelativeTimeFormat(undefined, { numeric: 'auto' })

function formatRelativeTime(value) {
  const time = new Date(value).getTime()
  if (!Number.isFinite(time)) return 'Just now'
  const seconds = Math.round((time - Date.now()) / 1000)
  if (Math.abs(seconds) < 60) return relativeTime.format(seconds, 'second')
  const minutes = Math.round(seconds / 60)
  if (Math.abs(minutes) < 60) return relativeTime.format(minutes, 'minute')
  const hours = Math.round(minutes / 60)
  if (Math.abs(hours) < 24) return relativeTime.format(hours, 'hour')
  const days = Math.round(hours / 24)
  if (Math.abs(days) < 30) return relativeTime.format(days, 'day')
  const months = Math.round(days / 30)
  if (Math.abs(months) < 12) return relativeTime.format(months, 'month')
  return relativeTime.format(Math.round(days / 365), 'year')
}

function friendlyCommentError(error) {
  if (error.status === 401) return 'Your session expired. Sign in again to post a comment.'
  if (error.status === 403) return 'You do not have permission to post this comment.'
  if (error.status === 404) return 'This finding could not be found. Refresh the review and try again.'
  if (error.status === 400) return 'Comments must contain between 1 and 1,000 characters.'
  return error.message || 'The comment could not be posted. Please try again.'
}

function CommentsThread({ finding, onAddComment, locked = false }) {
  const [text, setText] = useState('')
  const [posting, setPosting] = useState(false)
  const [error, setError] = useState('')
  const comments = finding.comments ?? []
  const commentId = `comment-text-${finding._id}`

  async function postComment(event) {
    event?.preventDefault()
    const value = text.trim()
    if (!value || value.length > 1000 || posting) return
    setError('')
    setPosting(true)
    try {
      await onAddComment(finding._id, value)
      setText('')
    } catch (requestError) {
      setError(friendlyCommentError(requestError))
    } finally {
      setPosting(false)
    }
  }

  return (
    <section aria-labelledby={`comments-title-${finding._id}`} className="comments-thread detail-section">
      <div className="comments-heading">
        <h3 id={`comments-title-${finding._id}`}><MessageSquare size={15} /> Discussion</h3>
        <span className="comment-total">{comments.length}</span>
      </div>
      <p className="comments-availability">
        {locked
          ? 'Comments stay open while this review is locked for approval.'
          : 'Comments are saved to this finding and can be added at any workflow stage.'}
      </p>
      {comments.length === 0 ? (
        <p className="comments-empty">No comments yet. Add a note to start the discussion.</p>
      ) : (
        <ol className="comment-list">
          {comments.map((comment, index) => {
            const createdAt = comment.createdAt ? new Date(comment.createdAt) : null
            const validTime = createdAt && Number.isFinite(createdAt.getTime())
            const role = ['reviewer', 'approver'].includes(comment.authorRole) ? comment.authorRole : 'reviewer'
            return (
              <li className="comment-item" key={comment._id ?? `${comment.createdAt}-${index}`}>
                <div className="comment-meta">
                  <strong>{comment.authorName || 'Former user'}</strong>
                  <span className={`comment-role role-${role}`}>{role}</span>
                  {validTime && <time dateTime={createdAt.toISOString()} title={createdAt.toLocaleString()}>{formatRelativeTime(createdAt)}</time>}
                </div>
                <p className="comment-text">{comment.text}</p>
              </li>
            )
          })}
        </ol>
      )}
      <form className="comment-form" onSubmit={postComment}>
        <label className="field-label" htmlFor={commentId}>Add a comment <span>Append-only · 1–1,000 characters</span></label>
        <textarea
          aria-describedby={`${commentId}-help${error ? ` ${commentId}-error` : ''}`}
          className="text-input comment-input"
          id={commentId}
          maxLength={1000}
          onChange={(event) => setText(event.target.value)}
          onKeyDown={(event) => {
            if (event.ctrlKey && event.key === 'Enter') {
              event.preventDefault()
              postComment()
            }
          }}
          placeholder="Add context or a question for the team..."
          value={text}
        />
        <div className="comment-form-footer">
          <span className="comment-counter" id={`${commentId}-help`}>{text.length} / 1,000 · Ctrl+Enter to post</span>
          <button className="button-primary button-small" disabled={posting || !text.trim() || text.trim().length > 1000} type="submit">
            {posting ? <><LoaderCircle className="animate-spin" size={14} /> Posting</> : <><Send size={13} /> Post comment</>}
          </button>
        </div>
        {error && <p className="comment-error" id={`${commentId}-error`} role="alert">{error}</p>}
      </form>
    </section>
  )
}

export default CommentsThread
