import Fact from '../../models/Fact.js'
import Rule from '../../models/Rule.js'
import buildFindings from './buildFindings.js'
import claimDetector from './claimDetector.js'
import factMatcher from './factMatcher.js'
import ruleChecker from './ruleChecker.js'
import splitSentences from './splitSentences.js'

export async function runReview({ text, brandName }) {
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
  const findings = buildFindings(ruleFindings, factFindings)

  // This is the seam for adding optional AI analysis after deterministic checks.
  const summary = findings.reduce(
    (counts, finding) => {
      counts.total += 1
      counts[finding.severity] += 1
      if (finding.type === 'needs_verification') {
        counts.needsVerification += 1
      }
      return counts
    },
    { total: 0, high: 0, medium: 0, low: 0, needsVerification: 0 },
  )

  return { findings, summary }
}
