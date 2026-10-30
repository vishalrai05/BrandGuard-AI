let request

async function parseDocument() {
  const { buffer: rawBuffer, fileType, maxPdfPages } = request
  const buffer = Buffer.from(rawBuffer)
  if (fileType === 'pdf') {
    const { PDFParse } = await import('pdf-parse')
    const parser = new PDFParse({ data: buffer, verbosity: 0 })
    try {
      const info = await parser.getInfo({ parsePageInfo: false })
      const pageCount = info.total
      if (!Number.isInteger(pageCount) || pageCount < 1) throw new Error('Invalid PDF page count.')
      if (pageCount > maxPdfPages) {
        process.send({ error: 'This PDF exceeds the configured page limit.' }, () => process.disconnect())
        return
      }
      const parsed = await parser.getText()
      process.send({ text: parsed.text, pageCount }, () => process.disconnect())
    } finally {
      await parser.destroy()
    }
    return
  }

  const mammoth = (await import('mammoth')).default
  const result = await mammoth.extractRawText({ buffer })
  process.send({ text: result.value, messages: result.messages.map(({ type }) => type) }, () => process.disconnect())
}

process.on('message', (message) => {
  request = message
  parseDocument().catch((error) => {
    const message = /password|encrypt/i.test(error?.message ?? '')
      ? 'This file is password-protected. Remove its password and try again.'
      : 'This file could not be read. Make sure it is a valid, unprotected PDF or DOCX.'
    process.send({ error: message }, () => process.disconnect())
  })
})
