import Fact from '../../models/Fact.js'
import Rule from '../../models/Rule.js'
import buildFindings from './buildFindings.js'
import claimDetector from './claimDetector.js'
import factMatcher from './factMatcher.js'
import ruleChecker from './ruleChecker.js'
import splitSentences from './splitSentences.js'
import analyzeWithAI from '../ai/aiAnalyzer.js'

function summarize(findings) {
  return findings.reduce(
    (counts, finding) => {
      counts.total += 1
      counts[finding.severity] += 1
      if (finding.type === 'needs_verification') counts.needsVerification += 1
      return counts
    },
    { total: 0, high: 0, medium: 0, low: 0, needsVerification: 0 },
  )
}

export async function runReview({ text, brandName, useAI = true }) {
  if (typeof text !== 'string') {
    throw new TypeError('text must be a string.')
  }

  const [rules, facts] = await Promise.all([
    Rule.find({ active: true }).lean(),
    Fact.find().lean(),
  ])
  const sentences = splitSentences(text)
  const ruleFindings = ruleChecker(sentences, rules, brandName)
  const claims = claimDetector(sentences)
  const factFindings = factMatcher(claims, facts)
  const deterministicFindings = buildFindings(ruleFindings, factFindings)
  let findings = deterministicFindings
  let aiStatus = 'ok'
  let counts = { returned: 0, kept: 0, dropped: 0 }

  if (useAI) {
    try {
      const aiResult = await analyzeWithAI({
        text,
        rules,
        facts,
        deterministicFindings,
      })
      counts = aiResult.counts
      findings = buildFindings(deterministicFindings, aiResult.findings)
    } catch (error) {
      aiStatus = 'unavailable'
      counts = error.counts ?? counts
      findings = deterministicFindings
    }
  }

  return { findings, summary: summarize(findings), aiStatus, counts }
}
