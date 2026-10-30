function positiveInteger(name, fallback) {
  const value = process.env[name]
  if (value === undefined || value === '') return fallback
  const parsed = Number(value)
  return Number.isSafeInteger(parsed) && parsed > 0 ? parsed : fallback
}

export function getAIConfig() {
  return {
    maxChunks: positiveInteger('AI_MAX_CHUNKS', 5),
    chunkChars: positiveInteger('AI_CHUNK_CHARS', 6_000),
    totalTimeoutMs: positiveInteger('AI_TOTAL_TIMEOUT_MS', 45_000),
  }
}
