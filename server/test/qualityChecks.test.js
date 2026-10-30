import assert from 'node:assert/strict'
import test from 'node:test'
import Fact from '../src/models/Fact.js'
import Rule from '../src/models/Rule.js'
import { facts, rules } from '../src/seed/seed.js'
import splitSentences from '../src/services/review/splitSentences.js'
import buildFindings from '../src/services/review/buildFindings.js'
import { runReview } from '../src/services/review/reviewEngine.js'
import { validateAIItems } from '../src/services/ai/aiAnalyzer.js'
import {
  calculateReadability,
  checkAllCapsRuns,
  checkAmbiguousLinkText,
  checkHardToReadSentences,
  checkJargon,
  checkLongSentences,
  checkPassiveVoice,
  checkRawUrlLinkText,
  checkSymbolBullets,
  getQualityConfig,
  runQualityChecks,
} from '../src/services/review/qualityChecks.js'

function check(fn, text, config) {
  const sentences = splitSentences(text)
  return fn(text, sentences, getQualityConfig({}, config))
}

test('READ-01 reports medium and high long sentences with exact offsets', () => {
  const mediumText = Array(31).fill('word').join(' ') + '.'
  const highText = Array(46).fill('word').join(' ') + '.'
  const medium = checkLongSentences(mediumText, splitSentences(mediumText))
  const high = checkLongSentences(highText, splitSentences(highText))
  assert.equal(medium[0].severity, 'medium')
  assert.equal(mediumText.slice(medium[0].startIndex, medium[0].endIndex), medium[0].matchedText)
  assert.equal(high[0].severity, 'high')
  assert.deepEqual(checkLongSentences('A short sentence.', splitSentences('A short sentence.')), [])
})

test('READ-02 flags high-grade sentences only after the minimum length', () => {
  const hard = `${Array(12).fill('institutionalization').join(' ')}.`
  const easy = 'We help teams write clear notes and share useful ideas with everyone on the team.'
  const finding = check(checkHardToReadSentences, hard)[0]
  assert.equal(finding.evidence.refCode, 'READ-02')
  assert.equal(hard.slice(finding.startIndex, finding.endIndex), finding.matchedText)
  assert.deepEqual(check(checkHardToReadSentences, easy), [])
})

test('READ-03 flags two possible passive constructions but not one', () => {
  const text = 'The report was written and the draft was reviewed.'
  const finding = check(checkPassiveVoice, text)[0]
  assert.equal(finding.evidence.refCode, 'READ-03')
  assert.equal(text.slice(finding.startIndex, finding.endIndex), finding.matchedText)
  assert.deepEqual(check(checkPassiveVoice, 'The report was written.'), [])
})

test('JARGON-01 uses configurable data and reports exact term offsets', () => {
  const text = 'We will circle back tomorrow.'
  const findings = check(checkJargon, text, { jargonTerms: ['circle back'] })
  assert.equal(findings[0].matchedText, 'circle back')
  assert.equal(text.slice(findings[0].startIndex, findings[0].endIndex), 'circle back')
  assert.deepEqual(check(checkJargon, 'We will follow up tomorrow.', { jargonTerms: ['circle back'] }), [])
})

test('LINK-01 detects Markdown, HTML and bare generic link phrases', () => {
  const text = '[click here](https://example.test) <a href="/help">read more</a>; click here to continue.'
  const findings = check(checkAmbiguousLinkText, text)
  assert.deepEqual(findings.map((finding) => finding.matchedText), ['click here', 'read more', 'click here'])
  for (const finding of findings) assert.equal(text.slice(finding.startIndex, finding.endIndex), finding.matchedText)
  assert.deepEqual(check(checkAmbiguousLinkText, '[Contact support](https://example.test/help)'), [])
})

test('LINK-02 flags raw URL link text over 60 characters only', () => {
  const longUrl = `https://${'a'.repeat(65)}.test/path`
  const longText = `[${longUrl}](https://destination.test)`
  const result = check(checkRawUrlLinkText, longText)
  assert.equal(result[0].matchedText, longUrl)
  assert.equal(longText.slice(result[0].startIndex, result[0].endIndex), longUrl)
  assert.deepEqual(check(checkRawUrlLinkText, '[https://short.test](https://destination.test)'), [])
})

test('ACC-01 flags all-caps runs and respects the acronym allowlist', () => {
  const text = 'PLEASE READ THIS API GUIDE.'
  const result = check(checkAllCapsRuns, text)
  assert.equal(result[0].matchedText, 'PLEASE READ THIS API GUIDE')
  assert.equal(text.slice(result[0].startIndex, result[0].endIndex), result[0].matchedText)
  assert.deepEqual(check(checkAllCapsRuns, 'NASA API FAQ are allowed.'), [])
})

test('ACC-02 flags decorative emoji bullets but ignores sentence symbols and standard bullets', () => {
  const text = '✅ Important update\n- Standard markdown item\nThe symbol → shows direction.'
  const result = check(checkSymbolBullets, text)
  assert.equal(result.length, 1)
  assert.equal(text.slice(result[0].startIndex, result[0].endIndex), '✅')
  assert.deepEqual(check(checkSymbolBullets, 'A sentence starts normally.'), [])
})

test('readability metrics are rounded and safe for normal, empty and one-sentence input', () => {
  const normal = 'Simple words help teams. Clear writing saves time.'
  const metrics = calculateReadability(normal, splitSentences(normal))
  assert.equal(metrics.wordCount, 8)
  assert.equal(metrics.sentenceCount, 2)
  assert.equal(metrics.avgSentenceLength, 4)
  assert.ok(Number.isFinite(metrics.fleschReadingEase))
  assert.equal(calculateReadability('', []).wordCount, 0)
  assert.equal(calculateReadability('', []).avgSentenceLength, 0)
  const one = calculateReadability('One clear sentence.', splitSentences('One clear sentence.'))
  assert.equal(one.sentenceCount, 1)
  assert.equal(one.avgSentenceLength, 3)
})

test('quality and rule findings preserve distinct categories and sort by text position', () => {
  const rule = { type: 'rule_violation', category: 'terminology', source: 'rules', startIndex: 10, endIndex: 15, evidence: { refCode: 'TERM-01' } }
  const differentCategory = { type: 'quality_check', category: 'accessibility', source: 'quality', startIndex: 10, endIndex: 15, evidence: { refCode: 'ACC-01' } }
  const sameCategory = { ...differentCategory, category: 'terminology', evidence: { refCode: 'READ-01' } }
  const later = { ...differentCategory, startIndex: 20, endIndex: 25 }
  const earlier = { ...differentCategory, startIndex: 1, endIndex: 5 }
  const findings = buildFindings([rule], [], [later, differentCategory, earlier, sameCategory])
  assert.deepEqual(findings.map((finding) => finding.startIndex), [1, 10, 10, 20])
  assert.equal(findings.filter((finding) => finding.startIndex === 10).length, 2)
})

test('qualityChecks=false skips findings but retains readability metrics', async () => {
  const originalRuleFind = Rule.find
  const originalFactFind = Fact.find
  Rule.find = () => ({ lean: async () => rules.map((rule) => ({ ...rule, active: true })) })
  Fact.find = () => ({ lean: async () => facts })
  try {
    const text = `${Array(35).fill('word').join(' ')}.`
    const result = await runReview({ text, brandName: 'Nimbus Notes', useAI: false, qualityChecks: false })
    assert.equal(result.qualityChecksRun, false)
    assert.ok(!result.findings.some((finding) => finding.evidence.kind === 'check'))
    assert.ok(result.summary.readability.wordCount > 0)
    assert.ok(result.summary.readability.longSentenceCount > 0)
  } finally {
    Rule.find = originalRuleFind
    Fact.find = originalFactFind
  }
})

test('AI validator cannot cite quality check codes or duplicate deterministic quality findings', () => {
  const qualityFinding = { source: 'quality', startIndex: 0, endIndex: 10, evidence: { kind: 'check', refCode: 'READ-01' } }
  const items = [
    { matchedText: 'synergy!!!', type: 'needs_verification', refCode: null, severity: 'medium', reason: 'duplicate', suggestion: 'Revise' },
    { matchedText: 'elsewhere', type: 'rule_violation', refCode: 'READ-01', severity: 'medium', reason: 'invalid citation', suggestion: 'Revise' },
  ]
  const result = validateAIItems(items, { text: 'synergy!!! and elsewhere', rules: [], facts: [], deterministicFindings: [qualityFinding] })
  assert.deepEqual(result.findings, [])
  assert.equal(result.dropped.length, 2)
  assert.ok(result.dropped.some((item) => item.reason === 'unknown refCode'))
})

test('quality check config reads environment overrides and jargon seed data', () => {
  const config = getQualityConfig({ QUALITY_LONG_SENTENCE_MEDIUM_WORDS: '33', QUALITY_JARGON_TERMS: 'buzzword,fluff' })
  assert.equal(config.longSentenceMediumWords, 33)
  assert.deepEqual(config.jargonTerms, ['buzzword', 'fluff'])
  assert.ok(checkJargon('buzzword', splitSentences('buzzword'), config).length)
})

test('quality checks return exact source spans and stable evidence codes', () => {
  const text = 'The line is shown. Please click here.'
  const findings = runQualityChecks(text, splitSentences(text))
  for (const finding of findings) {
    assert.equal(text.slice(finding.startIndex, finding.endIndex), finding.matchedText)
    assert.equal(finding.evidence.kind, 'check')
    assert.equal(finding.code, finding.evidence.refCode)
  }
})
