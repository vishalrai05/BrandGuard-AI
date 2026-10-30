import { fork } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import { getDocumentLimits } from '../../config/documents.js'

const EXTRACTION_TIMEOUT_MS = 15_000
const TOO_LITTLE_PDF_TEXT = 'This PDF looks scanned or image-only. OCR is not supported yet.'

export class DocumentExtractionError extends Error {
  constructor(message, status = 422) {
    super(message)
    this.name = 'DocumentExtractionError'
    this.status = status
  }
}

export function normalizeExtractedText(value) {
  return String(value ?? '')
    .replace(/\r\n?/g, '\n')
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F-\u009F]/g, '')
    .replace(/[\t\u000B\f]+/g, ' ')
    .replace(/\n(?:[ \t]*\n){2,}/g, '\n\n')
    .trim()
}

function findDocxDocumentEntry(buffer) {
  const start = Math.max(0, buffer.length - 65_557)
  let endOffset = -1
  for (let offset = buffer.length - 22; offset >= start; offset -= 1) {
    if (buffer.readUInt32LE(offset) === 0x06054b50) {
      endOffset = offset
      break
    }
  }
  if (endOffset < 0 || endOffset + 22 > buffer.length) return null
  const entries = buffer.readUInt16LE(endOffset + 10)
  const directorySize = buffer.readUInt32LE(endOffset + 12)
  let offset = buffer.readUInt32LE(endOffset + 16)
  const directoryEnd = offset + directorySize
  if (directoryEnd > endOffset || entries > 10_000) return null
  for (let index = 0; index < entries && offset + 46 <= directoryEnd; index += 1) {
    if (buffer.readUInt32LE(offset) !== 0x02014b50) return null
    const nameLength = buffer.readUInt16LE(offset + 28)
    const extraLength = buffer.readUInt16LE(offset + 30)
    const commentLength = buffer.readUInt16LE(offset + 32)
    const nextOffset = offset + 46 + nameLength + extraLength + commentLength
    if (nextOffset > directoryEnd) return null
    const name = buffer.toString('utf8', offset + 46, offset + 46 + nameLength).replaceAll('\\', '/')
    if (name.toLowerCase() === 'word/document.xml') return true
    offset = nextOffset
  }
  return false
}

function detectFileType(buffer) {
  if (buffer.length >= 5 && buffer.subarray(0, 5).toString('ascii') === '%PDF-') return 'pdf'
  if (buffer.length >= 4 && buffer[0] === 0x50 && buffer[1] === 0x4b) {
    const hasDocument = findDocxDocumentEntry(buffer)
    if (hasDocument === true) return 'docx'
    if (hasDocument === null) throw new DocumentExtractionError('This DOCX file appears to be corrupt. Save a new copy and try again.')
  }
  throw new DocumentExtractionError('Unsupported or invalid file. Upload a PDF or DOCX document.', 400)
}

function runWorker(buffer, fileType, maxPdfPages) {
  return new Promise((resolve, reject) => {
    const worker = fork(fileURLToPath(new URL('./extractTextWorker.js', import.meta.url)), [], {
      execArgv: ['--max-old-space-size=128'],
      serialization: 'advanced',
      stdio: ['ignore', 'ignore', 'ignore', 'ipc'],
    })
    let settled = false
    const timeout = setTimeout(() => {
      if (settled) return
      settled = true
      worker.kill()
      reject(new DocumentExtractionError('Document extraction timed out. Try a smaller or simpler file.'))
    }, EXTRACTION_TIMEOUT_MS)
    const finish = (callback, value) => {
      if (settled) return
      settled = true
      clearTimeout(timeout)
      callback(value)
    }
    worker.once('message', (result) => {
      if (result.error) finish(reject, new DocumentExtractionError(result.error))
      else finish(resolve, result)
    })
    worker.once('error', () => {
      finish(reject, new DocumentExtractionError('This file could not be read. Make sure it is a valid, unprotected PDF or DOCX.'))
    })
    worker.once('exit', (code) => {
      if (code !== 0) finish(reject, new DocumentExtractionError('This file could not be read. Make sure it is a valid, unprotected PDF or DOCX.'))
    })
    worker.send({ buffer, fileType, maxPdfPages })
  })
}

export async function extractText({ buffer, filename: _filename, mimetype: _mimetype }) {
  if (!Buffer.isBuffer(buffer) || buffer.length === 0) {
    throw new DocumentExtractionError('The uploaded file is empty.', 400)
  }
  const fileType = detectFileType(buffer)
  const { maxDocChars, maxPdfPages } = getDocumentLimits()
  const parsed = await runWorker(buffer, fileType, maxPdfPages)
  const normalized = normalizeExtractedText(parsed.text)
  const pageCount = fileType === 'pdf' ? parsed.pageCount : null
  if (!normalized) throw new DocumentExtractionError('No readable text was found in the uploaded file.', 400)
  if (fileType === 'pdf' && normalized.length / pageCount < 20) {
    throw new DocumentExtractionError(TOO_LITTLE_PDF_TEXT)
  }

  const warnings = []
  if (fileType === 'docx') {
    warnings.push('Tables, images, and some document formatting may not be represented in extracted text.')
    if (parsed.messages?.length) warnings.push('The DOCX parser reported content it could not fully extract.')
  }
  if (fileType === 'pdf' && pageCount > 50) warnings.push('This PDF has more than 50 pages; check that all relevant text was extracted.')

  const truncated = normalized.length > maxDocChars
  const text = truncated ? normalized.slice(0, maxDocChars) : normalized
  if (truncated) warnings.push(`Text was truncated to the ${maxDocChars.toLocaleString()} character limit.`)

  return { text, fileType, pageCount, charCount: text.length, truncated, warnings }
}

export { TOO_LITTLE_PDF_TEXT }
