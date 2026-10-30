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

function friendlyErrorMessage(status, payload, authEntry) {
  const serverMessage = typeof payload?.error === 'string' ? payload.error : ''
  if (status === 401 && !authEntry) return 'Your session expired. Please sign in again.'
  if (status === 403) return 'You do not have permission to perform this action.'
  if (status === 503 && serverMessage) return serverMessage
  if (status === 409 && /locked/i.test(serverMessage)) return 'This review is locked while awaiting approval.'
  if (status >= 500) return 'The server could not complete that request. Please try again.'
  return serverMessage || `Request failed with HTTP ${status}.`
}

async function request(path, options = {}, { onSlow, onSlowComplete, slowAfterMs = 5_000 } = {}) {
  if (!baseUrl) {
    throw new Error('VITE_API_URL is not configured. Set it to your deployed API URL.')
  }

  let response
  const isFormData = typeof FormData !== 'undefined' && options.body instanceof FormData
  let slowNotified = false
  const slowTimer = setTimeout(() => {
    slowNotified = true
    onSlow?.()
  }, slowAfterMs)

  try {
    try {
      response = await fetch(`${baseUrl}${path}`, {
        ...options,
        headers: {
          ...(options.body && !isFormData ? { 'Content-Type': 'application/json' } : {}),
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
      const authEntry = isAuthEntry(path)
      if (response.status === 401 && !authEntry) expireSession()
      const error = new Error(friendlyErrorMessage(response.status, payload, authEntry))
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
  createReview: (inputText, brandName, useAI, qualityChecks, source, requestOptions, brandId) =>
    request('/api/reviews', {
      method: 'POST',
      body: JSON.stringify({ inputText, brandName, useAI, qualityChecks, ...(brandId ? { brand: brandId } : {}), ...(source ? { source } : {}) }),
    }, requestOptions),
  extractDocument: (file, requestOptions = {}) => {
    const body = new FormData()
    body.append('file', file)
    return request('/api/documents/extract', { method: 'POST', body, signal: requestOptions.signal }, requestOptions)
  },
  getReview: (id, requestOptions) =>
    request(`/api/reviews/${encodeURIComponent(id)}`, {}, requestOptions),
  getReport: (id, options = {}, requestOptions) => {
    const params = new URLSearchParams({
      includeFullText: String(options.includeFullText === true),
      includeComments: String(options.includeComments !== false),
      includeAudit: String(options.includeAudit !== false),
    })
    return request(`/api/reviews/${encodeURIComponent(id)}/report?${params.toString()}`, {}, requestOptions)
  },
  getReportSummary: (ids, requestOptions) => request('/api/reviews/report-summary', {
    method: 'POST', body: JSON.stringify({ ids }),
  }, requestOptions),
  addFindingComment: (reviewId, findingId, text, requestOptions) => request(
    `/api/reviews/${encodeURIComponent(reviewId)}/findings/${encodeURIComponent(findingId)}/comments`,
    { method: 'POST', body: JSON.stringify({ text }) },
    requestOptions,
  ),
  getReviewAudit: (reviewId, page = 1, limit = 25, requestOptions) => request(
    `/api/reviews/${encodeURIComponent(reviewId)}/audit?page=${encodeURIComponent(page)}&limit=${encodeURIComponent(limit)}`,
    {},
    requestOptions,
  ),
  getReviews: (requestOptions) => request('/api/reviews', {}, requestOptions),
  getInsights: ({ days = 30, scope = 'all', brand } = {}, requestOptions) => {
    const params = new URLSearchParams({ days: String(days), scope })
    if (brand) params.set('brand', brand)
    return request(`/api/insights?${params.toString()}`, {}, requestOptions)
  },
  getInsightBrands: (requestOptions) => request('/api/insights/brands', {}, requestOptions),
  getBrands: (requestOptions) => request('/api/brands', {}, requestOptions),
  createBrand: (name, description) => request('/api/brands', { method: 'POST', body: JSON.stringify({ name, description }) }),
  updateBrand: (id, fields) => request(`/api/brands/${encodeURIComponent(id)}`, { method: 'PATCH', body: JSON.stringify(fields) }),
  getRules: (options = {}, requestOptions) => {
    const params = new URLSearchParams()
    if (options.brand) params.set('brand', options.brand)
    if (options.status) params.set('status', options.status)
    if (options.category) params.set('category', options.category)
    return request(`/api/rules${params.size ? `?${params}` : ''}`, {}, requestOptions ?? options.requestOptions)
  },
  getFacts: (options = {}, requestOptions) => {
    const params = new URLSearchParams()
    if (options.brand) params.set('brand', options.brand)
    if (options.status) params.set('status', options.status)
    return request(`/api/facts${params.size ? `?${params}` : ''}`, {}, requestOptions ?? options.requestOptions)
  },
  createRule: (data) => request('/api/rules', { method: 'POST', body: JSON.stringify(data) }),
  updateRule: (id, data) => request(`/api/rules/${encodeURIComponent(id)}`, { method: 'PATCH', body: JSON.stringify(data) }),
  createFact: (data) => request('/api/facts', { method: 'POST', body: JSON.stringify(data) }),
  updateFact: (id, data) => request(`/api/facts/${encodeURIComponent(id)}`, { method: 'PATCH', body: JSON.stringify(data) }),
  ruleAction: (id, action, data = {}) => request(`/api/rules/${encodeURIComponent(id)}/${action}`, { method: 'POST', body: JSON.stringify(data) }),
  factAction: (id, action, data = {}) => request(`/api/facts/${encodeURIComponent(id)}/${action}`, { method: 'POST', body: JSON.stringify(data) }),
  getLibraryLog: (brandId, page = 1, limit = 25) => request(`/api/brands/${encodeURIComponent(brandId)}/library-log?page=${page}&limit=${limit}`),
  ingestGuideline: (brandId, data, requestOptions = {}) => request(`/api/brands/${encodeURIComponent(brandId)}/ingest`, { method: 'POST', body: JSON.stringify(data), signal: requestOptions.signal }, requestOptions),
  getIngestionRuns: (brandId, page = 1, limit = 20, requestOptions) => request(`/api/brands/${encodeURIComponent(brandId)}/ingestion-runs?page=${page}&limit=${limit}`, {}, requestOptions),
  bulkRules: (action, ids, note) => request('/api/rules/bulk', { method: 'POST', body: JSON.stringify({ action, ids, ...(note ? { note } : {}) }) }),
  bulkFacts: (action, ids, note) => request('/api/facts/bulk', { method: 'POST', body: JSON.stringify({ action, ids, ...(note ? { note } : {}) }) }),
  getSetupStatus: (brandId, requestOptions) => request(`/api/brands/${encodeURIComponent(brandId)}/setup-status`, {}, requestOptions),
  testRule: (rule, sampleText) => request('/api/rules/test', { method: 'POST', body: JSON.stringify({ rule, sampleText }) }),
  getNextRuleCode: (prefix, brand) => request(`/api/rules/next-code?prefix=${encodeURIComponent(prefix)}${brand ? `&brand=${encodeURIComponent(brand)}` : ''}`),
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
