import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'
import Fact from '../src/models/Fact.js'
import Rule from '../src/models/Rule.js'
import { facts, rules } from '../src/seed/seed.js'
import factMatcher from '../src/services/review/factMatcher.js'
import splitSentences from '../src/services/review/splitSentences.js'
import { runReview } from '../src/services/review/reviewEngine.js'

test('review engine detects planted issues and preserves evidence offsets', async () => {
  const originalRuleFind = Rule.find
  const originalFactFind = Fact.find
  const inputText = await readFile(
    new URL('../src/seed/demoDocument.txt', import.meta.url),
    'utf8',
  )
  const demoText = inputText.slice(inputText.indexOf('*/') + 2).trim()

  Rule.find = () => ({
    lean: async () => rules.map((rule) => ({ active: true, ...rule })),
  })
  Fact.find = () => ({ lean: async () => facts })

  try {
    const { findings, summary } = await runReview({
      text: demoText,
      brandName: 'Nimbus Notes',
    })
    const ruleCodes = new Set(
      findings
        .filter((finding) => finding.type === 'rule_violation')
        .map((finding) => finding.evidence.refCode),
    )

    for (const expectedCode of [
      'TERM-01',
      'CLAIM-01',
      'TERM-03',
      'TERM-04',
      'LEGAL-01',
    ]) {
      assert.ok(ruleCodes.has(expectedCode), `Expected rule ${expectedCode}`)
    }
    assert.equal(
      findings.find(
        (finding) =>
          finding.type === 'rule_violation' &&
          finding.evidence.refCode === 'TERM-01',
      ).suggestion,
      'Nimbus Notes',
    )
    assert.equal(
      findings.find(
        (finding) =>
          finding.type === 'rule_violation' &&
          finding.matchedText === 'cheap',
      ).suggestion,
      'affordable',
    )
    assert.equal(
      findings.find(
        (finding) =>
          finding.type === 'rule_violation' &&
          finding.matchedText === 'guys',
      ).suggestion,
      'everyone',
    )

    const mismatch = findings.find(
      (finding) =>
        finding.type === 'fact_mismatch' &&
        finding.matchedText.includes('30 million active users'),
    )
    assert.ok(mismatch, 'Expected the contradictory user-count claim')
    assert.equal(mismatch.evidence.refCode, 'FACT-01')
    assert.equal(mismatch.severity, 'high')
    assert.ok(
      !findings.some(
        (finding) =>
          finding.type === 'needs_verification' &&
          finding.startIndex === mismatch.startIndex &&
          finding.endIndex === mismatch.endIndex,
      ),
      'A fact mismatch should not also be marked for verification',
    )

    const unsupportedClaims = findings.filter(
      (finding) => finding.type === 'needs_verification',
    )
    assert.ok(unsupportedClaims.length >= 2)
    assert.ok(
      unsupportedClaims.some((finding) =>
        finding.matchedText.includes('twice as creative'),
      ),
    )
    assert.ok(
      unsupportedClaims.some((finding) =>
        finding.matchedText.includes('eliminate missed deadlines'),
      ),
    )
    assert.ok(
      !findings.some(
        (finding) =>
          finding.matchedText.includes('$8 per user') &&
          ['fact_mismatch', 'needs_verification'].includes(finding.type),
      ),
      'The Plus price agrees with its approved fact',
    )

    for (const correctText of [
      '25 million registered accounts.',
      '42 integrations',
    ]) {
      const correctClaimIndex = demoText.indexOf(correctText)
      assert.ok(
        !findings.some(
          (finding) =>
            finding.startIndex <= correctClaimIndex &&
            finding.endIndex >= correctClaimIndex + correctText.length &&
            finding.type !== 'rule_violation',
        ),
        `Expected supported claim "${correctText}" to have no fact finding`,
      )
    }

    for (const finding of findings) {
      assert.equal(
        demoText.slice(finding.startIndex, finding.endIndex),
        finding.matchedText,
        `Finding offset mismatch for ${finding.evidence.refCode}`,
      )
    }

    assert.equal(summary.total, findings.length)
    assert.equal(
      summary.needsVerification,
      unsupportedClaims.length,
    )
    assert.equal(
      summary.high,
      findings.filter((finding) => finding.severity === 'high').length,
    )
    assert.equal(
      summary.medium,
      findings.filter((finding) => finding.severity === 'medium').length,
    )
    assert.equal(
      summary.low,
      findings.filter((finding) => finding.severity === 'low').length,
    )

    const clean = await runReview({
      text: 'Nimbus Notes helps teams organize their notes in one workspace.',
      brandName: 'Nimbus Notes',
    })
    assert.deepEqual(clean.findings, [])

    const abbreviationSentences = splitSentences(
      'Dr. Lin reviewed version 99.9%. It passed, e.g. the quick check.',
    )
    assert.equal(abbreviationSentences.length, 2)
    assert.equal(
      abbreviationSentences[0].text,
      'Dr. Lin reviewed version 99.9%.',
    )

    assert.deepEqual(
      factMatcher(
        [{ text: 'Nimbus Notes has 2M users.', start: 0, end: 27 }],
        [
          {
            code: 'FACT-TEST',
            statement: 'Nimbus Notes has 2,000,000 users.',
            keywords: ['users'],
            value: 2,
            unit: 'million users',
          },
        ],
      ),
      [],
      'Equivalent million notation should be supported',
    )
  } finally {
    Rule.find = originalRuleFind
    Fact.find = originalFactFind
  }
})
