import assert from 'node:assert/strict'
import test from 'node:test'
import { createAIAnalyzer } from '../src/services/ai/aiAnalyzer.js'

const input = {
  text: 'Our users love Nimbus Notes.',
  rules: [{ code: 'TONE-01', title: 'Tone', description: 'Use evidence-backed language.' }],
  facts: [],
  deterministicFindings: [],
}

function mockedProvider(responses) {
  let index = 0
  return {
    analyze: async () => responses[index++],
  }
}

test('AI analyzer accepts valid evidence-backed findings and batches their rewrite', async () => {
  const analyze = createAIAnalyzer({
    provider: mockedProvider([
      '```json\n[{"matchedText":"Our users love Nimbus Notes.","type":"rule_violation","refCode":"TONE-01","severity":"medium","reason":"This implies unsupported customer sentiment.","suggestion":"Use neutral wording."}]\n```',
      '[{"index":0,"suggestedRewrite":"Nimbus Notes helps people organize their work."}]',
    ]),
    logger: { info() {}, warn() {} },
  })

  const { findings, counts } = await analyze(input)
  assert.equal(findings.length, 1)
  assert.equal(findings[0].source, 'ai')
  assert.equal(findings[0].startIndex, 0)
  assert.equal(findings[0].endIndex, input.text.length)
  assert.equal(findings[0].evidence.refCode, 'TONE-01')
  assert.equal(findings[0].suggestedRewrite, 'Nimbus Notes helps people organize their work.')
  assert.deepEqual(counts, { returned: 1, kept: 1, dropped: 0 })
})

test('AI analyzer rejects invalid JSON so caller can use deterministic-only results', async () => {
  const analyze = createAIAnalyzer({
    provider: mockedProvider(['not json']),
    logger: { info() {}, warn() {} },
  })
  await assert.rejects(analyze(input), SyntaxError)
})

test('AI analyzer drops findings that cite a hallucinated Rule or Fact code', async () => {
  const analyze = createAIAnalyzer({
    provider: mockedProvider([
      '[{"matchedText":"Our users love Nimbus Notes.","type":"rule_violation","refCode":"MADE-UP","severity":"medium","reason":"Unsupported tone.","suggestion":"Revise."}]',
    ]),
    logger: { info() {}, warn() {} },
  })
  const result = await analyze(input)
  assert.deepEqual(result.findings, [])
  assert.deepEqual(result.counts, { returned: 1, kept: 0, dropped: 1 })
})

test('AI analyzer drops findings whose matched text is not verbatim in the input', async () => {
  const analyze = createAIAnalyzer({
    provider: mockedProvider([
      '[{"matchedText":"Our customers love us.","type":"needs_verification","refCode":null,"severity":"medium","reason":"Unsupported sentiment.","suggestion":"Qualify the claim."}]',
    ]),
    logger: { info() {}, warn() {} },
  })
  const result = await analyze(input)
  assert.deepEqual(result.findings, [])
  assert.deepEqual(result.counts, { returned: 1, kept: 0, dropped: 1 })
})

test('AI analyzer accepts needs_verification without a ref and matches case and whitespace flexibly', async () => {
  const text = 'Our users absolutely adore us,\nand everyone is switching to Nimbus Notes.'
  const analyze = createAIAnalyzer({
    provider: mockedProvider([
      '[{"matchedText":"OUR USERS   ABSOLUTELY adore us, and everyone is switching to Nimbus Notes.","type":"needs_verification","refCode":null,"severity":"medium","reason":"Unsupported social proof.","suggestion":"Add evidence or qualify this claim."}]',
      '[{"index":0,"suggestedRewrite":"Customers can use Nimbus Notes to organize their notes."}]',
    ]),
    logger: { info() {}, warn() {} },
  })

  const { findings, counts } = await analyze({ ...input, text })
  assert.equal(findings.length, 1)
  assert.equal(findings[0].matchedText, text)
  assert.equal(text.slice(findings[0].startIndex, findings[0].endIndex), text)
  assert.deepEqual(findings[0].evidence, { kind: 'none', refCode: '', excerpt: '' })
  assert.deepEqual(counts, { returned: 1, kept: 1, dropped: 0 })
})

test('AI analyzer logs parse and dropped-item reasons without losing counts', async () => {
  const logs = []
  const analyze = createAIAnalyzer({
    provider: mockedProvider([
      '[{"matchedText":"not present","type":"needs_verification","refCode":null,"severity":"medium","reason":"Unsupported.","suggestion":"Qualify."},{"matchedText":"Our users love Nimbus Notes.","type":"rule_violation","refCode":"FAKE","severity":"medium","reason":"Unsupported.","suggestion":"Revise."}]',
    ]),
    logger: { info: (message) => logs.push(message), warn: (message) => logs.push(message) },
  })
  const result = await analyze(input)
  assert.deepEqual(result.counts, { returned: 2, kept: 0, dropped: 2 })
  assert.ok(logs.some((line) => line.includes('analysis raw response:')))
  assert.ok(logs.some((line) => line.includes('analysis parsed items: 2')))
  assert.ok(logs.some((line) => line.includes('matchedText not found verbatim')))
  assert.ok(logs.some((line) => line.includes('unknown refCode')))
})

test('AI analyzer reports invalid JSON in server logs', async () => {
  const logs = []
  const analyze = createAIAnalyzer({
    provider: mockedProvider(['not json']),
    logger: { info: (message) => logs.push(message), warn: (message) => logs.push(message) },
  })
  await assert.rejects(analyze(input), SyntaxError)
  assert.ok(logs.some((line) => line.includes('dropped response: invalid JSON')))
})

test('AI analyzer logs invalid schemas and overlaps with deterministic findings', async () => {
  const logs = []
  const deterministicFindings = [{ startIndex: 0, endIndex: 29, source: 'rules' }]
  const analyze = createAIAnalyzer({
    provider: mockedProvider([
      '[{"matchedText":"Our users love Nimbus Notes.","type":"needs_verification","refCode":null,"severity":"medium","reason":"Unsupported.","suggestion":"Qualify."},{"matchedText":"Our users love Nimbus Notes.","type":"needs_verification","refCode":null,"severity":"medium","reason":"Unsupported.","suggestion":"Qualify.","extra":"unexpected"}]',
      '[]',
    ]),
    logger: { info: (message) => logs.push(message), warn: (message) => logs.push(message) },
  })
  const result = await analyze({ ...input, deterministicFindings })
  assert.deepEqual(result.counts, { returned: 2, kept: 0, dropped: 2 })
  assert.ok(logs.some((line) => line.includes('duplicate of rule finding')))
  assert.ok(logs.some((line) => line.includes('invalid schema')))
})
