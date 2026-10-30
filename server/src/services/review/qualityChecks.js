import defaultJargonTerms from '../../seed/jargonTerms.json' with { type: 'json' }

export const QUALITY_CHECK_TITLES = Object.freeze({
  'READ-01': 'Long sentence',
  'READ-02': 'Hard-to-read sentence',
  'READ-03': 'Passive-voice-heavy sentence',
  'JARGON-01': 'Jargon and filler',
  'LINK-01': 'Ambiguous link text',
  'LINK-02': 'Raw URL used as link text',
  'ACC-01': 'All-caps run',
  'ACC-02': 'Symbol or emoji bullet',
})

export const QUALITY_DEFAULTS = Object.freeze({
  longSentenceMediumWords: 30,
  longSentenceHighWords: 45,
  hardToReadGrade: 16,
  hardToReadMinimumWords: 12,
  passiveMinimumOccurrences: 2,
  rawUrlLinkTextCharacters: 60,
  allCapsMinimumWords: 3,
  jargonTerms: defaultJargonTerms,
  titles: QUALITY_CHECK_TITLES,
  acronymAllowlist: ['AI', 'API', 'CEO', 'EU', 'FAQ', 'GDP', 'HTML', 'NASA', 'PDF', 'SEO', 'SOC', 'SaaS', 'UK', 'UI', 'URL', 'USA', 'UX'],
})

export function getQualityConfig(env = process.env, overrides = {}) {
  const number = (key, fallback) => {
    const parsed = Number(env[key])
    return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback
  }
  const envTerms = env.QUALITY_JARGON_TERMS
    ?.split(',').map((term) => term.trim()).filter(Boolean)
  const envAcronyms = env.QUALITY_ACRONYMS
    ?.split(',').map((term) => term.trim()).filter(Boolean)
  return {
    ...QUALITY_DEFAULTS,
    longSentenceMediumWords: number('QUALITY_LONG_SENTENCE_MEDIUM_WORDS', QUALITY_DEFAULTS.longSentenceMediumWords),
    longSentenceHighWords: number('QUALITY_LONG_SENTENCE_HIGH_WORDS', QUALITY_DEFAULTS.longSentenceHighWords),
    hardToReadGrade: number('QUALITY_HARD_TO_READ_GRADE', QUALITY_DEFAULTS.hardToReadGrade),
    hardToReadMinimumWords: number('QUALITY_HARD_TO_READ_MIN_WORDS', QUALITY_DEFAULTS.hardToReadMinimumWords),
    passiveMinimumOccurrences: number('QUALITY_PASSIVE_MIN_OCCURRENCES', QUALITY_DEFAULTS.passiveMinimumOccurrences),
    rawUrlLinkTextCharacters: number('QUALITY_RAW_URL_LINK_TEXT_CHARS', QUALITY_DEFAULTS.rawUrlLinkTextCharacters),
    allCapsMinimumWords: number('QUALITY_ALL_CAPS_MIN_WORDS', QUALITY_DEFAULTS.allCapsMinimumWords),
    jargonTerms: overrides.jargonTerms ?? envTerms ?? defaultJargonTerms,
    acronymAllowlist: overrides.acronymAllowlist ?? envAcronyms ?? QUALITY_DEFAULTS.acronymAllowlist,
    ...overrides,
  }
}

function wordMatches(text) {
  return [...text.matchAll(/[\p{L}\p{N}]+(?:['’][\p{L}\p{N}]+)*/gu)]
}

export function estimateSyllables(word) {
  const cleaned = word.toLowerCase().replace(/[^a-z]/g, '')
  if (!cleaned) return 0
  if (cleaned.length <= 3) return 1
  const groups = cleaned.match(/[aeiouy]+/g) ?? []
  let count = groups.length
  if (cleaned.endsWith('e')) count -= 1
  if (cleaned.endsWith('le') && cleaned.length > 2 && !/[aeiouy]le$/.test(cleaned.slice(-3))) count += 1
  return Math.max(1, count)
}

function sentenceWords(sentence) {
  return wordMatches(sentence.text)
}

export function calculateReadability(text, sentences, config = getQualityConfig()) {
  const words = wordMatches(text)
  const wordCount = words.length
  const sentenceCount = sentences.length
  const syllableCount = words.reduce((total, match) => total + estimateSyllables(match[0]), 0)
  const average = sentenceCount ? wordCount / sentenceCount : 0
  const wordsPerSentence = sentenceCount && wordCount ? wordCount / sentenceCount : 0
  const syllablesPerWord = wordCount ? syllableCount / wordCount : 0
  const fleschReadingEase = wordCount && sentenceCount
    ? 206.835 - (1.015 * wordsPerSentence) - (84.6 * syllablesPerWord)
    : 0
  const fleschKincaidGrade = wordCount && sentenceCount
    ? (0.39 * wordsPerSentence) + (11.8 * syllablesPerWord) - 15.59
    : 0
  return {
    wordCount,
    sentenceCount,
    avgSentenceLength: Number(average.toFixed(1)),
    fleschReadingEase: Number(fleschReadingEase.toFixed(1)),
    fleschKincaidGrade: Number(fleschKincaidGrade.toFixed(1)),
    longSentenceCount: sentences.filter((sentence) => sentenceWords(sentence).length > config.longSentenceMediumWords).length,
  }
}

function makeFinding(code, category, severity, suggestion, text, startIndex, endIndex, excerpt) {
  return {
    type: 'quality_check',
    code,
    category,
    severity,
    matchedText: text.slice(startIndex, endIndex),
    startIndex,
    endIndex,
    evidence: { kind: 'check', refCode: code, excerpt },
    suggestion,
    status: 'open',
  }
}

export function checkLongSentences(text, sentences, config = getQualityConfig()) {
  return sentences.flatMap((sentence) => {
    const count = sentenceWords(sentence).length
    if (count <= config.longSentenceMediumWords) return []
    const severity = count > config.longSentenceHighWords ? 'high' : 'medium'
    return [makeFinding('READ-01', 'readability', severity, 'Split this sentence or remove unnecessary words to make it easier to scan.', text, sentence.start, sentence.end, `Sentence has ${count} words; limit is ${config.longSentenceMediumWords}.`)]
  })
}

export function checkHardToReadSentences(text, sentences, config = getQualityConfig()) {
  const findings = []
  for (const sentence of sentences) {
    const words = sentenceWords(sentence)
    if (words.length < config.hardToReadMinimumWords) continue
    const grade = calculateReadability(sentence.text, [{ text: sentence.text }]).fleschKincaidGrade
    if (grade <= config.hardToReadGrade) continue
    findings.push(makeFinding('READ-02', 'readability', 'low', 'Use shorter words and simpler sentence structure.', text, sentence.start, sentence.end, `Sentence has an estimated Flesch-Kincaid grade of ${grade}; threshold is ${config.hardToReadGrade}.`))
  }
  return findings
}

export function checkPassiveVoice(text, sentences, config = getQualityConfig()) {
  const findings = []
  const passive = /\b(?:am|is|are|was|were|be|been|being)\s+(?:\w+ly\s+)?([a-z]+(?:ed|en))\b/gi
  for (const sentence of sentences) {
    const matches = [...sentence.text.matchAll(passive)]
    if (matches.length < config.passiveMinimumOccurrences) continue
    findings.push(makeFinding('READ-03', 'readability', 'low', 'Prefer active voice where it makes the sentence clearer.', text, sentence.start, sentence.end, `Sentence contains ${matches.length} possible passive-voice constructions; threshold is ${config.passiveMinimumOccurrences}. This is a simple heuristic and may be inaccurate.`))
  }
  return findings
}

export function checkJargon(text, sentences, config = getQualityConfig()) {
  const findings = []
  for (const term of config.jargonTerms) {
    if (!term) continue
    const escapedTerm = term.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
    const expression = new RegExp(`(?<![\\p{L}\\p{N}_])${escapedTerm}(?![\\p{L}\\p{N}_])`, 'giu')
    for (const match of text.matchAll(expression)) {
      findings.push(makeFinding('JARGON-01', 'readability', 'low', 'Replace jargon or filler with a specific, plain-language description.', text, match.index, match.index + match[0].length, `Matched jargon or filler term: ${match[0]}.`))
    }
  }
  return findings
}

export function checkAmbiguousLinkText(text, sentences, config = getQualityConfig()) {
  const findings = []
  const generic = /^(?:click here|here|read more|learn more|link|this)$/i
  const patterns = [
    /\[([^\]]+)\]\((?:[^()]+|\([^()]*\))*\)/g,
    /<a\b[^>]*>(.*?)<\/a>/gi,
  ]
  const spans = []
  for (const expression of patterns) {
    for (const match of text.matchAll(expression)) {
      const offset = match.index + match[0].indexOf(match[1])
      spans.push({ value: match[1].trim(), start: offset + match[1].indexOf(match[1].trim()) })
    }
  }
  const phrase = /\b(?:click here|read more|learn more)\b/gi
  for (const match of text.matchAll(phrase)) spans.push({ value: match[0], start: match.index })
  const seen = new Set()
  for (const span of spans) {
    const start = span.start
    const end = start + span.value.length
    if (!span.value || !generic.test(span.value)) continue
    const key = `${start}:${end}`
    if (seen.has(key)) continue
    seen.add(key)
    findings.push(makeFinding('LINK-01', 'accessibility', 'medium', 'Describe the link destination so people know where it leads.', text, start, end, `Link text “${span.value}” does not describe its destination.`))
  }
  return findings
}

export function checkRawUrlLinkText(text, sentences, config = getQualityConfig()) {
  const findings = []
  const expression = /\[([^\]]*https?:\/\/[^\]]*)\]\((?:[^()]+|\([^()]*\))*\)/gi
  for (const match of text.matchAll(expression)) {
    const value = match[1].trim()
    if (value.length <= config.rawUrlLinkTextCharacters) continue
    const start = match.index + match[0].indexOf(match[1]) + match[1].indexOf(value)
    findings.push(makeFinding('LINK-02', 'accessibility', 'low', 'Replace the raw URL with a short descriptive link label.', text, start, start + value.length, `Link text is a raw URL with ${value.length} characters; limit is ${config.rawUrlLinkTextCharacters}.`))
  }
  return findings
}

export function checkAllCapsRuns(text, sentences, config = getQualityConfig()) {
  const allowlist = new Set(config.acronymAllowlist.map((value) => value.toUpperCase()))
  const findings = []
  const expression = /\b[A-Z][A-Z0-9-]{2,}\b(?:\s+\b[A-Z][A-Z0-9-]{2,}\b)*/g
  for (const match of text.matchAll(expression)) {
    const words = match[0].split(/\s+/).filter((word) => !allowlist.has(word.toUpperCase()))
    if (words.length < config.allCapsMinimumWords) continue
    findings.push(makeFinding('ACC-01', 'accessibility', 'low', 'Use sentence case instead of a long all-caps phrase.', text, match.index, match.index + match[0].length, `Found ${words.length} consecutive all-caps words outside the acronym allowlist; threshold is ${config.allCapsMinimumWords}.`))
  }
  return findings
}

export function checkSymbolBullets(text, sentences, config = getQualityConfig()) {
  const findings = []
  const expression = /^\s*(?:[•●▪◦◆✓✔★☆→➜✅⚠️]|(?:\p{Extended_Pictographic}(?:\uFE0F|\u200D\p{Extended_Pictographic})*))(?=\s)/gmu
  for (const match of text.matchAll(expression)) {
    const start = match.index + match[0].search(/[^\s]/)
    const end = start + match[0].trimEnd().length
    findings.push(makeFinding('ACC-02', 'accessibility', 'low', 'Use a standard list marker and clear text instead of a symbol or emoji as the only line separator.', text, start, end, 'Line begins with an emoji or decorative symbol used as a bullet/separator. This simple check does not assess surrounding context.'))
  }
  return findings
}

const checks = [checkLongSentences, checkHardToReadSentences, checkPassiveVoice, checkJargon, checkAmbiguousLinkText, checkRawUrlLinkText, checkAllCapsRuns, checkSymbolBullets]

export function runQualityChecks(text, sentences, config = getQualityConfig()) {
  return checks.flatMap((check) => check(text, sentences, config)).sort((a, b) => a.startIndex - b.startIndex || a.endIndex - b.endIndex)
}
