function positiveInteger(name, fallback) {
  const value = process.env[name]
  if (value === undefined || value === '') return fallback
  const parsed = Number(value)
  return Number.isSafeInteger(parsed) && parsed > 0 ? parsed : fallback
}

export function getDocumentLimits() {
  return {
    maxUploadMb: positiveInteger('MAX_UPLOAD_MB', 5),
    maxDocChars: positiveInteger('MAX_DOC_CHARS', 60_000),
    maxPdfPages: positiveInteger('MAX_PDF_PAGES', 100),
  }
}

export function sanitizeDocumentFilename(value) {
  const base = String(value ?? '').replaceAll('\\', '/').split('/').pop()
  return base.replace(/[\u0000-\u001F\u007F-\u009F]/g, '').trim().slice(0, 120)
}
