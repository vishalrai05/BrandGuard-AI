import assert from 'node:assert/strict'
import test from 'node:test'
import { chunkForAi, createChunkedAIAnalyzer } from '../src/services/ai/aiAnalyzer.js'

const silentLogger = { info() {}, warn() {} }
const rules = []
const facts = []

function response(text, suggestion = 'Clarify this wording.') {
  return JSON.stringify([{
    matchedText: text,
    type: 'needs_verification',
    refCode: null,
    severity: 'medium',
    reason: 'This statement needs evidence.',
    suggestion,
  }])
}

function promptText(prompt) {
  return JSON.parse(prompt.match(/SUBMITTED TEXT \(JSON\):\n([^\n]+)/)[1])
}

test('chunkForAi prefers paragraph and sentence boundaries and preserves exact offsets', () => {
  const text = 'First paragraph has a short sentence. Another sentence follows.\n\nSecond paragraph contains more words than the first.'
  const chunks = chunkForAi(text, { maxChars: 42 })
  assert.ok(chunks.length > 1)
  assert.ok(chunks[0].text.endsWith('.'))
  assert.equal(chunks.map((chunk) => chunk.text).join(''), text)
  for (const chunk of chunks) assert.equal(text.slice(chunk.start, chunk.end), chunk.text)
  assert.ok(chunks.every((chunk) => chunk.start === 0 || /[\s.!?]/.test(text[chunk.start - 1])))
})

test('AI findings from later chunks are shifted to full-document offsets', async () => {
  const text = 'The first section is descriptive and calm.\n\nThe second section makes a claim.'
  const calls = []
  const provider = { analyze: async (prompt) => {
    calls.push(prompt)
    if (prompt.includes('FINDINGS TO REWRITE')) return '[{"index":0,"suggestedRewrite":"Add supporting evidence."}]'
    const chunk = promptText(prompt)
    return chunk.includes('second section') ? response('The second section makes a claim.') : '[]'
  } }
  const analyze = createChunkedAIAnalyzer({ provider, logger: silentLogger, config: { maxChunks: 5, chunkChars: 42, totalTimeoutMs: 5_000 } })
  const result = await analyze({ text, rules, facts, deterministicFindings: [] })
  const finding = result.findings[0]
  const expectedStart = text.indexOf('The second section makes a claim.')
  assert.equal(finding.startIndex, expectedStart)
  assert.equal(text.slice(finding.startIndex, finding.endIndex), finding.matchedText)
  assert.equal(finding.suggestedRewrite, 'Add supporting evidence.')
  assert.equal(calls.length, 3)
})

test('hallucinated text in chunk two is rejected against that chunk', async () => {
  const text = 'First section has enough words to be considered.\n\nSecond section has its own sentence.'
  const provider = { analyze: async (prompt) => {
    if (prompt.includes('FINDINGS TO REWRITE')) return '[]'
    return promptText(prompt).includes('Second section')
      ? response('Text that does not occur in this section.')
      : '[]'
  } }
  const analyze = createChunkedAIAnalyzer({ provider, logger: silentLogger, config: { maxChunks: 5, chunkChars: 42, totalTimeoutMs: 5_000 } })
  const result = await analyze({ text, rules, facts, deterministicFindings: [] })
  assert.deepEqual(result.findings, [])
  assert.equal(result.counts.returned, 1)
  assert.equal(result.counts.dropped, 1)
})

test('more chunks than AI_MAX_CHUNKS returns partial status and counts', async () => {
  const text = ['First section has enough words.', 'Second section has enough words.', 'Third section has enough words.', 'Fourth section has enough words.'].join('\n\n')
  const provider = { analyze: async () => '[]' }
  const analyze = createChunkedAIAnalyzer({ provider, logger: silentLogger, config: { maxChunks: 2, chunkChars: 25, totalTimeoutMs: 5_000 } })
  const result = await analyze({ text, rules, facts, deterministicFindings: [] })
  assert.equal(result.aiStatus, 'partial')
  assert.ok(result.ai.chunksTotal > result.ai.chunksAnalysed)
  assert.equal(result.ai.chunksAnalysed, 2)
  assert.match(result.ai.message, /rule-based checks covered the whole document/)
})

test('a failed chunk does not discard successful chunk findings', async () => {
  const text = 'First section supports the result.\n\nSecond section fails during analysis.'
  let analysisCalls = 0
  const provider = { analyze: async (prompt) => {
    if (prompt.includes('FINDINGS TO REWRITE')) return '[{"index":0,"suggestedRewrite":"Qualify the claim."}]'
    analysisCalls += 1
    if (analysisCalls === 2) throw new Error('provider timeout')
    return response('First section supports the result.')
  } }
  const analyze = createChunkedAIAnalyzer({ provider, logger: silentLogger, config: { maxChunks: 5, chunkChars: 40, totalTimeoutMs: 5_000 } })
  const result = await analyze({ text, rules, facts, deterministicFindings: [] })
  assert.equal(result.aiStatus, 'partial')
  assert.equal(result.ai.chunksAnalysed, 1)
  assert.equal(result.findings.length, 1)
  assert.equal(text.slice(result.findings[0].startIndex, result.findings[0].endIndex), result.findings[0].matchedText)
})

test('the overall AI budget returns while a chunk provider is still pending', async () => {
  const provider = { analyze: (_prompt, { signal }) => new Promise((_resolve, reject) => {
    signal.addEventListener('abort', () => reject(new Error('aborted')), { once: true })
  }) }
  const analyze = createChunkedAIAnalyzer({ provider, timeoutMs: 2_000, logger: silentLogger, config: { maxChunks: 5, chunkChars: 10, totalTimeoutMs: 60 } })
  const started = Date.now()
  const result = await analyze({ text: 'A simple test sentence.', rules, facts, deterministicFindings: [] })
  assert.ok(Date.now() - started < 500)
  assert.equal(result.aiStatus, 'failed')
  assert.equal(result.ai.chunksAnalysed, 0)
})
