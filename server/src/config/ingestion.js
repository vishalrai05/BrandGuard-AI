function positiveInteger(name, fallback) {
  const value = process.env[name]
  if (value === undefined || value === '') return fallback
  const parsed = Number(value)
  return Number.isSafeInteger(parsed) && parsed > 0 ? parsed : fallback
}

export function getIngestionConfig() {
  return {
    maxChunks: positiveInteger('AI_INGEST_MAX_CHUNKS', 8),
    maxItems: positiveInteger('AI_INGEST_MAX_ITEMS', 40),
    totalTimeoutMs: positiveInteger('AI_INGEST_TOTAL_TIMEOUT_MS', 60_000),
    chunkChars: 6_000,
  }
}
