const baseUrl = import.meta.env.VITE_API_URL?.replace(/\/+$/, '')

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
      throw new Error(payload?.error ?? `Request failed with HTTP ${response.status}.`)
    }

    return payload
  } finally {
    clearTimeout(slowTimer)
    if (slowNotified) onSlowComplete?.()
  }
}

export const api = {
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
}
