import { Router } from 'express'
import multer from 'multer'
import { ipKeyGenerator, rateLimit } from 'express-rate-limit'
import { getDocumentLimits } from '../config/documents.js'
import { requireAuth } from '../middleware/auth.js'
import { DocumentExtractionError, extractText } from '../services/documents/extractText.js'

const router = Router()
const { maxUploadMb } = getDocumentLimits()
const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: maxUploadMb * 1024 * 1024,
    files: 1,
    fields: 0,
    parts: 1,
  },
})
const uploadLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 20,
  standardHeaders: 'draft-8',
  legacyHeaders: false,
  keyGenerator: (req) => {
    const userId = req.user?._id ?? req.user?.id
    return userId ? String(userId) : ipKeyGenerator(req.ip)
  },
  message: { error: 'Too many document extraction requests. Please try again later.' },
})

function sanitizeFilename(value, fileType) {
  const base = String(value ?? '').replaceAll('\\', '/').split('/').pop()
  const safe = base.replace(/[\u0000-\u001F\u007F-\u009F]/g, '').trim().slice(0, 120)
  return safe || `document.${fileType}`
}

export function handleUploadError(error, res) {
  if (error instanceof multer.MulterError) {
    if (error.code === 'LIMIT_FILE_SIZE') {
      const { maxUploadMb: limit } = getDocumentLimits()
      return res.status(413).json({ error: `File is too large. Maximum upload size is ${limit} MB.` })
    }
    if (error.code === 'LIMIT_UNEXPECTED_FILE') return res.status(400).json({ error: 'Upload exactly one file in the "file" field.' })
    return res.status(400).json({ error: 'Invalid multipart upload. Send one file in the "file" field only.' })
  }
  return res.status(400).json({ error: 'Invalid multipart upload.' })
}

function parseSingleUpload(req, res, next) {
  upload.single('file')(req, res, (error) => {
    if (error) return handleUploadError(error, res)
    return next()
  })
}

export async function extractDocument(req, res) {
  if (!req.file) return res.status(400).json({ error: 'A file is required in the "file" field.' })
  try {
    const result = await extractText({ buffer: req.file.buffer, filename: req.file.originalname, mimetype: req.file.mimetype })
    if (!result.text.trim()) return res.status(400).json({ error: 'No readable text was found in the uploaded file.' })
    return res.json({
      filename: sanitizeFilename(req.file.originalname, result.fileType),
      ...result,
    })
  } catch (error) {
    if (error instanceof DocumentExtractionError) return res.status(error.status).json({ error: error.message })
    console.error('Document extraction failed.')
    return res.status(500).json({ error: 'Document extraction failed. Please try a different file.' })
  } finally {
    if (req.file) req.file.buffer = null
  }
}

router.use(requireAuth)
router.post('/extract', uploadLimiter, parseSingleUpload, extractDocument)

export default router
