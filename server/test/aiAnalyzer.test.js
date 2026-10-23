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

  const findings = await analyze(input)
  assert.equal(findings.length, 1)
  assert.equal(findings[0].source, 'ai')
  assert.equal(findings[0].startIndex, 0)
  assert.equal(findings[0].endIndex, input.text.length)
  assert.equal(findings[0].evidence.refCode, 'TONE-01')
  assert.equal(findings[0].suggestedRewrite, 'Nimbus Notes helps people organize their work.')
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
  assert.deepEqual(await analyze(input), [])
})

test('AI analyzer drops findings whose matched text is not verbatim in the input', async () => {
  const analyze = createAIAnalyzer({
    provider: mockedProvider([
      '[{"matchedText":"Our customers love us.","type":"needs_verification","refCode":null,"severity":"medium","reason":"Unsupported sentiment.","suggestion":"Qualify the claim."}]',
    ]),
    logger: { info() {}, warn() {} },
  })
  assert.deepEqual(await analyze(input), [])
})
