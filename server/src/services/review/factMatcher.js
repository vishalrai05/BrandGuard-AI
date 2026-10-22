function normalize(value) {
  return value.toLocaleLowerCase().replace(/[^a-z0-9]+/g, ' ').trim()
}

function scoreFact(sentence, fact) {
  const text = ` ${normalize(sentence)} `
  const matchedKeywords = new Set()

  for (const keyword of fact.keywords ?? []) {
    const normalizedKeyword = normalize(keyword)
    if (normalizedKeyword && text.includes(` ${normalizedKeyword} `)) {
      matchedKeywords.add(normalizedKeyword)
    }
  }

  return matchedKeywords.size
}

function parseNumbers(text) {
  const values = []
  const pattern =
    /(?<![\w])(?:[$€£]\s*)?\d[\d,]*(?:\.\d+)?\s*(?:%|million|m\b|thousand|k\b|billion|b\b)?/gi

  for (const match of text.matchAll(pattern)) {
    const raw = match[0].trim().replace(/[$€£,\s]/g, '')
    const number = Number.parseFloat(raw)
    if (!Number.isFinite(number)) {
      continue
    }

    const suffix = raw.match(/(million|thousand|billion|m|k|b|%)$/i)?.[0]?.toLowerCase()
    const scale = {
      thousand: 1_000,
      k: 1_000,
      million: 1_000_000,
      m: 1_000_000,
      billion: 1_000_000_000,
      b: 1_000_000_000,
      '%': 1,
    }[suffix] ?? 1

    values.push(number * scale)
  }

  return values
}

function factNumbers(fact) {
  const values = parseNumbers(fact.statement)

  if (fact.value !== undefined && fact.value !== null) {
    const unit = fact.unit?.toLowerCase() ?? ''
    const scale = /\bmillion\b|\bmillions\b/.test(unit)
      ? 1_000_000
      : /\bthousand\b|\bthousands\b/.test(unit)
        ? 1_000
        : /\bbillion\b|\bbillions\b/.test(unit)
          ? 1_000_000_000
          : 1
    values.push(fact.value * scale)
  }

  return [...new Set(values)]
}

function numbersAgree(claim, fact) {
  const claimNumbers = parseNumbers(claim)

  if (claimNumbers.length === 0) {
    return true
  }

  const approvedNumbers = factNumbers(fact)

  return (
    approvedNumbers.length > 0 &&
    claimNumbers.every((claimNumber) =>
      approvedNumbers.some((approvedNumber) => {
        const tolerance = Math.max(Math.abs(approvedNumber) * 0.001, 0.01)
        return Math.abs(claimNumber - approvedNumber) <= tolerance
      }),
    )
  )
}

function makeFactFinding(claim, fact) {
  const hasFact = Boolean(fact)

  return {
    type: hasFact ? 'fact_mismatch' : 'needs_verification',
    severity: hasFact ? 'high' : 'medium',
    matchedText: claim.text,
    startIndex: claim.start,
    endIndex: claim.end,
    evidence: hasFact
      ? { kind: 'fact', refCode: fact.code, excerpt: fact.statement }
      : { kind: 'none', refCode: '', excerpt: '' },
    suggestion: hasFact
      ? 'Verify this claim against the approved fact before publication.'
      : 'Verify this claim with an approved source before publication.',
    status: 'open',
  }
}

export default function factMatcher(claims, facts) {
  const findings = []

  for (const claim of claims) {
    let bestFact
    let bestScore = 0

    for (const fact of facts) {
      const score = scoreFact(claim.text, fact)
      if (score > bestScore) {
        bestFact = fact
        bestScore = score
      }
    }

    if (!bestFact) {
      findings.push(makeFactFinding(claim, null))
    } else if (!numbersAgree(claim.text, bestFact)) {
      findings.push(makeFactFinding(claim, bestFact))
    }
  }

  return findings
}
