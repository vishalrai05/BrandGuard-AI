import assert from 'node:assert/strict'
import multer from 'multer'
import test from 'node:test'
import documentsRouter, { extractDocument, handleUploadError } from '../src/routes/documents.js'
import { requireAuth } from '../src/middleware/auth.js'
import { extractText, normalizeExtractedText, DocumentExtractionError } from '../src/services/documents/extractText.js'

function response() {
  return { statusCode: 200, status(code) { this.statusCode = code; return this }, json(body) { this.body = body; return this } }
}

function pdfFixture(text = 'This is a readable document containing enough text for the parser.') {
  const safeText = text.replaceAll('\\', '\\\\').replaceAll('(', '\\(').replaceAll(')', '\\)')
  const objects = [
    '<< /Type /Catalog /Pages 2 0 R >>',
    '<< /Type /Pages /Kids [3 0 R] /Count 1 >>',
    '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 5 0 R >> >> /Contents 4 0 R >>',
    `<< /Length ${Buffer.byteLength(`BT /F1 12 Tf 72 720 Td (${safeText}) Tj ET`)} >>\nstream\nBT /F1 12 Tf 72 720 Td (${safeText}) Tj ET\nendstream`,
    '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>',
  ]
  let pdf = '%PDF-1.4\n'
  const offsets = [0]
  objects.forEach((object, index) => {
    offsets.push(Buffer.byteLength(pdf))
    pdf += `${index + 1} 0 obj\n${object}\nendobj\n`
  })
  const xrefOffset = Buffer.byteLength(pdf)
  pdf += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`
  for (const offset of offsets.slice(1)) pdf += `${String(offset).padStart(10, '0')} 00000 n \n`
  pdf += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xrefOffset}\n%%EOF`
  return Buffer.from(pdf)
}

const crcTable = Array.from({ length: 256 }, (_value, index) => {
  let crc = index
  for (let bit = 0; bit < 8; bit += 1) crc = crc & 1 ? (crc >>> 1) ^ 0xedb88320 : crc >>> 1
  return crc >>> 0
})
function crc32(buffer) {
  let crc = 0xffffffff
  for (const byte of buffer) crc = crcTable[(crc ^ byte) & 0xff] ^ (crc >>> 8)
  return (crc ^ 0xffffffff) >>> 0
}

function zipFixture(entries) {
  const localParts = []
  const centralParts = []
  let localOffset = 0
  for (const [name, value] of Object.entries(entries)) {
    const nameBytes = Buffer.from(name)
    const data = Buffer.from(value)
    const crc = crc32(data)
    const local = Buffer.alloc(30)
    local.writeUInt32LE(0x04034b50, 0)
    local.writeUInt16LE(20, 4)
    local.writeUInt32LE(crc, 14)
    local.writeUInt32LE(data.length, 18)
    local.writeUInt32LE(data.length, 22)
    local.writeUInt16LE(nameBytes.length, 26)
    localParts.push(local, nameBytes, data)

    const central = Buffer.alloc(46)
    central.writeUInt32LE(0x02014b50, 0)
    central.writeUInt16LE(20, 4)
    central.writeUInt16LE(20, 6)
    central.writeUInt32LE(crc, 16)
    central.writeUInt32LE(data.length, 20)
    central.writeUInt32LE(data.length, 24)
    central.writeUInt16LE(nameBytes.length, 28)
    central.writeUInt32LE(localOffset, 42)
    centralParts.push(central, nameBytes)
    localOffset += local.length + nameBytes.length + data.length
  }
  const centralDirectory = Buffer.concat(centralParts)
  const end = Buffer.alloc(22)
  end.writeUInt32LE(0x06054b50, 0)
  end.writeUInt16LE(Object.keys(entries).length, 8)
  end.writeUInt16LE(Object.keys(entries).length, 10)
  end.writeUInt32LE(centralDirectory.length, 12)
  end.writeUInt32LE(localOffset, 16)
  return Buffer.concat([...localParts, centralDirectory, end])
}

function docxFixture(text = 'Nimbus Notes keeps approved guidance easy to find.') {
  return zipFixture({
    '[Content_Types].xml': '<?xml version="1.0"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/></Types>',
    'word/document.xml': `<?xml version="1.0"?><w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body><w:p><w:r><w:t>${text}</w:t></w:r></w:p><w:sectPr/></w:body></w:document>`,
  })
}

test('extractText reads valid PDF and DOCX buffers without writing them to disk', async () => {
  const pdf = await extractText({ buffer: pdfFixture(), filename: 'draft.pdf', mimetype: 'application/pdf' })
  assert.equal(pdf.fileType, 'pdf')
  assert.equal(pdf.pageCount, 1)
  assert.match(pdf.text, /readable document/)
  assert.equal(pdf.charCount, pdf.text.length)

  const docx = await extractText({ buffer: docxFixture(), filename: 'guidelines.docx', mimetype: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' })
  assert.equal(docx.fileType, 'docx')
  assert.equal(docx.pageCount, null)
  assert.match(docx.text, /approved guidance/)
  assert.equal(docx.charCount, docx.text.length)
  assert.ok(docx.warnings.some((warning) => warning.includes('Tables, images')))
})

test('magic bytes reject a text file renamed to PDF and empty input', async () => {
  await assert.rejects(extractText({ buffer: Buffer.from('This is a text file.'), filename: 'renamed.pdf', mimetype: 'application/pdf' }), (error) => error.status === 400 && /Unsupported|invalid/.test(error.message))
  await assert.rejects(extractText({ buffer: Buffer.alloc(0), filename: 'empty.pdf', mimetype: 'application/pdf' }), (error) => error.status === 400 && /empty/.test(error.message))
})

test('malformed ZIP-based DOCX files return a friendly corrupt-file error', async () => {
  await assert.rejects(extractText({ buffer: Buffer.from([0x50, 0x4b, 0x03, 0x04, 0, 0]), filename: 'broken.docx', mimetype: '' }), (error) => error.status === 422 && /corrupt/i.test(error.message))
})

test('PDFs without readable text are rejected as scanned or image-only', async () => {
  await assert.rejects(extractText({ buffer: pdfFixture('short'), filename: 'scan.pdf', mimetype: 'application/pdf' }), (error) => error instanceof DocumentExtractionError && error.status === 422 && /OCR is not supported/.test(error.message))
})

test('normalization standardizes line endings, removes controls, collapses blank runs and trims', () => {
  assert.equal(normalizeExtractedText('\u0000  First\r\n\r\n\r\n\r\nSecond\u0007\rThird  '), 'First\n\nSecond\nThird')
})

test('document character limit truncates text and reports a warning', async (t) => {
  const previous = process.env.MAX_DOC_CHARS
  process.env.MAX_DOC_CHARS = '24'
  t.after(() => previous === undefined ? delete process.env.MAX_DOC_CHARS : process.env.MAX_DOC_CHARS = previous)
  const result = await extractText({ buffer: docxFixture('This DOCX contains more than twenty four readable characters.'), filename: 'long.docx', mimetype: '' })
  assert.equal(result.truncated, true)
  assert.equal(result.charCount, 24)
  assert.ok(result.warnings.some((warning) => warning.includes('truncated')))
})

test('upload size errors are 413 and unexpected file fields are 400', () => {
  const tooLarge = response()
  handleUploadError(new multer.MulterError('LIMIT_FILE_SIZE'), tooLarge)
  assert.equal(tooLarge.statusCode, 413)
  assert.match(tooLarge.body.error, /too large/i)
  const wrongField = response()
  handleUploadError(new multer.MulterError('LIMIT_UNEXPECTED_FILE', 'other'), wrongField)
  assert.equal(wrongField.statusCode, 400)
})

test('document extraction route is authenticated and returns a sanitized filename', async () => {
  assert.ok(documentsRouter.stack.some((layer) => layer.route?.path === '/extract'))
  const unauthenticated = response()
  await requireAuth({ get: () => '' }, unauthenticated, () => assert.fail('unauthenticated request must not continue'))
  assert.equal(unauthenticated.statusCode, 401)

  const missing = response()
  await extractDocument({ file: undefined }, missing)
  assert.equal(missing.statusCode, 400)

  const req = { file: { buffer: docxFixture(), originalname: 'C:\\private\\guidelines.docx', mimetype: 'application/octet-stream' } }
  const res = response()
  await extractDocument(req, res)
  assert.equal(res.statusCode, 200)
  assert.equal(res.body.filename, 'guidelines.docx')
  assert.equal(res.body.fileType, 'docx')
  assert.equal(req.file.buffer, null)
})
