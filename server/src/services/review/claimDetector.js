const comparativeTerms = new Set([
  'better',
  'best',
  'biggest',
  'fastest',
  'faster',
  'greatest',
  'largest',
  'leading',
  'least',
  'less',
  'lowest',
  'more',
  'most',
  'newest',
  'number-one',
  'oldest',
  'strongest',
  'top',
  'twice',
])

const quantityPatterns = [
  /\b\d+(?:\.\d+)?\s*(?:thousand|million|billion)s?\s+of\b/i,
  /\b(?:hundreds|thousands|millions|billions)\s+of\b/i,
]

export default function claimDetector(sentences) {
  return sentences.flatMap((sentence) => {
    const reasons = []

    if (/\d/.test(sentence.text)) {
      reasons.push('number')
    }
    if (/\d(?:[\d,]*\d)?(?:\.\d+)?\s*%/.test(sentence.text)) {
      reasons.push('percentage')
    }
    if (/[$€£]\s*\d|\b\d+(?:\.\d+)?\s*(?:USD|EUR|GBP)\b/i.test(sentence.text)) {
      reasons.push('currency')
    }
    if (/\b(?:19|20)\d{2}\b/.test(sentence.text)) {
      reasons.push('year')
    }
    if (
      sentence.text
        .toLowerCase()
        .match(/[a-z]+(?:-[a-z]+)*/g)
        ?.some((word) => comparativeTerms.has(word))
    ) {
      reasons.push('comparative_or_superlative')
    }
    if (quantityPatterns.some((pattern) => pattern.test(sentence.text))) {
      reasons.push('quantity')
    }
    if (/\b(?:eliminate|guarantee|guaranteed)\b/i.test(sentence.text)) {
      reasons.push('absolute_claim')
    }

    return reasons.length > 0 ? [{ ...sentence, reason: reasons }] : []
  })
}
