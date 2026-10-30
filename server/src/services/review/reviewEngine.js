import Fact from '../../models/Fact.js'
import Brand from '../../models/Brand.js'
import mongoose from 'mongoose'
import Rule from '../../models/Rule.js'
import buildFindings from './buildFindings.js'
import claimDetector from './claimDetector.js'
import factMatcher from './factMatcher.js'
import ruleChecker from './ruleChecker.js'
import splitSentences from './splitSentences.js'
import analyzeWithAI from '../ai/aiAnalyzer.js'
import { calculateReadability, getQualityConfig, runQualityChecks } from './qualityChecks.js'

const MAX_FINDINGS = 1_000
const SEVERITY_RANK = { high: 0, medium: 1, low: 2 }

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

export async function runReview({ text, brandName, brandId, useAI = true, qualityChecks = true, qualityConfig }) {
  if (typeof text !== 'string') {
    throw new TypeError('text must be a string.')
  }

  const selectedBrand = brandId || mongoose.connection.readyState !== 1 ? null : await Brand.findOne({ isDefault: true }).select('_id').lean()
  const scopedBrandId = brandId ?? selectedBrand?._id
  const [rules, facts] = await Promise.all([
    scopedBrandId ? Rule.find({ brand: scopedBrandId, status: 'active', active: true }).lean() : mongoose.connection.readyState === 1 ? Promise.resolve([]) : Rule.find({ active: true }).lean(),
    scopedBrandId ? Fact.find({ brand: scopedBrandId, status: 'active' }).lean() : mongoose.connection.readyState === 1 ? Promise.resolve([]) : Fact.find().lean(),
  ])
  const sentences = splitSentences(text)
  const ruleFindings = ruleChecker(sentences, rules, brandName)
  const activeQualityConfig = qualityConfig ?? getQualityConfig()
  const qualityFindings = qualityChecks
    ? runQualityChecks(text, sentences, activeQualityConfig)
    : []
  const claims = claimDetector(sentences)
  const factFindings = factMatcher(claims, facts)
  const deterministicFindings = buildFindings(ruleFindings, factFindings, qualityFindings)
  let findings = deterministicFindings
  let aiStatus = 'ok'
  let ai = { chunksTotal: 0, chunksAnalysed: 0, message: '' }
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
      aiStatus = aiResult.aiStatus
      ai = aiResult.ai
    } catch (error) {
      aiStatus = 'failed'
      counts = error.counts ?? counts
      findings = deterministicFindings
      ai = {
        chunksTotal: 1,
        chunksAnalysed: 0,
        message: 'AI analysis could not be completed; rule-based checks covered the whole document.',
      }
    }
  }

  const summary = summarize(findings)
  summary.readability = calculateReadability(text, sentences, activeQualityConfig)
  const totalDetected = findings.length
  const findingsTruncated = totalDetected > MAX_FINDINGS
  if (findingsTruncated) {
    summary.totalDetected = totalDetected
    findings = findings
      .slice()
      .sort((left, right) => SEVERITY_RANK[left.severity] - SEVERITY_RANK[right.severity]
        || left.startIndex - right.startIndex || left.endIndex - right.endIndex)
      .slice(0, MAX_FINDINGS)
      .sort((left, right) => left.startIndex - right.startIndex || left.endIndex - right.endIndex)
  }
  return { findings, summary, aiStatus, ai, counts, findingsTruncated, qualityChecksRun: qualityChecks }
}

export { MAX_FINDINGS }
