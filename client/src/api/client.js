const baseUrl = import.meta.env.VITE_API_URL?.replace(/\/+$/, '')
const TOKEN_KEY = 'brandguard-token'
let redirectingForExpiredSession = false

export function getAuthToken() {
  return window.localStorage.getItem(TOKEN_KEY)
}

export function setAuthToken(token) {
  window.localStorage.setItem(TOKEN_KEY, token)
  redirectingForExpiredSession = false
}

export function clearAuthToken() {
  window.localStorage.removeItem(TOKEN_KEY)
  redirectingForExpiredSession = false
}

function isAuthEntry(path) {
  return path === '/api/auth/login' || path === '/api/auth/register'
}

function expireSession() {
  window.localStorage.removeItem(TOKEN_KEY)
  if (redirectingForExpiredSession) return
  redirectingForExpiredSession = true
  window.dispatchEvent(new CustomEvent('brandguard:session-expired'))
}

async function request(path, options = {}, { onSlow, onSlowComplete } = {}) {
  if (!baseUrl) {
    throw new Error('VITE_API_URL is not configured. Set it to your deployed API URL.')
  }

  let response
  let slowNotified = false
  const slowTimer = setTimeout(() => {
    slowNotified = true
    onSlow?.()
  }, 5_000)

  try {
    try {
      response = await fetch(`${baseUrl}${path}`, {
        ...options,
        headers: {
          ...(options.body ? { 'Content-Type': 'application/json' } : {}),
          ...(getAuthToken() ? { Authorization: `Bearer ${getAuthToken()}` } : {}),
          ...options.headers,
        },
      })
    } catch (error) {
      if (error instanceof Error && error.name === 'AbortError') {
        throw error
      }
      throw new Error('Could not connect to the BrandGuard API. Check that the server is running.')
    }

    const contentType = response.headers.get('content-type') ?? ''
    const payload = contentType.includes('application/json')
      ? await response.json()
      : null

    if (!response.ok) {
      if (response.status === 401 && !isAuthEntry(path)) expireSession()
      const error = new Error(payload?.error ?? `Request failed with HTTP ${response.status}.`)
      error.status = response.status
      throw error
    }

    return payload
  } finally {
    clearTimeout(slowTimer)
    if (slowNotified) onSlowComplete?.()
  }
}

export const api = {
  register: (name, email, password) => request('/api/auth/register', {
    method: 'POST', body: JSON.stringify({ name, email, password }),
  }),
  login: (email, password) => request('/api/auth/login', {
    method: 'POST', body: JSON.stringify({ email, password }),
  }),
  me: async () => (await request('/api/auth/me')).user,
  createReview: (inputText, brandName, useAI, requestOptions) =>
    request('/api/reviews', {
      method: 'POST',
      body: JSON.stringify({ inputText, brandName, useAI }),
    }, requestOptions),
  getReview: (id, requestOptions) =>
    request(`/api/reviews/${encodeURIComponent(id)}`, {}, requestOptions),
  getReviews: (requestOptions) => request('/api/reviews', {}, requestOptions),
  getRules: (requestOptions) => request('/api/rules', {}, requestOptions),
  getFacts: (requestOptions) => request('/api/facts', {}, requestOptions),
  updateFinding: (reviewId, findingId, status, requestOptions) =>
    request(
      `/api/reviews/${encodeURIComponent(reviewId)}/findings/${encodeURIComponent(findingId)}`,
      {
        method: 'PATCH',
        body: JSON.stringify({ status }),
      },
      requestOptions,
    ),
  submitReview: (reviewId, requestOptions) => request(
    `/api/reviews/${encodeURIComponent(reviewId)}/submit`, { method: 'POST' }, requestOptions,
  ),
  approveReview: (reviewId, note, requestOptions) => request(
    `/api/reviews/${encodeURIComponent(reviewId)}/approve`,
    { method: 'POST', body: JSON.stringify(note === undefined ? {} : { note }) },
    requestOptions,
  ),
  requestChanges: (reviewId, note, requestOptions) => request(
    `/api/reviews/${encodeURIComponent(reviewId)}/request-changes`,
    { method: 'POST', body: JSON.stringify({ note }) },
    requestOptions,
  ),
}
