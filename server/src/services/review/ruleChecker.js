function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

function makeFinding(rule, matchedText, startIndex, endIndex) {
  return {
    type: 'rule_violation',
    severity: rule.severity,
    matchedText,
    startIndex,
    endIndex,
    evidence: {
      kind: 'rule',
      refCode: rule.code,
      excerpt: rule.description,
    },
    suggestion: rule.replacement || rule.suggestion,
    status: 'open',
  }
}

function findBannedTerms(rule, sentence, brandName) {
  const findings = []

  for (const value of rule.values ?? []) {
    if (!value) {
      continue
    }

    const isBrandNameCaseVariant =
      rule.category === 'terminology' &&
      brandName &&
      value.toLowerCase() === brandName.toLowerCase() &&
      value !== brandName
    const expression = new RegExp(
      `(?<![\\p{L}\\p{N}_])${escapeRegExp(value)}(?![\\p{L}\\p{N}_])`,
      'giu',
    )

    for (const match of sentence.text.matchAll(expression)) {
      if (isBrandNameCaseVariant && match[0] === brandName) {
        continue
      }

      const startIndex = sentence.start + match.index
      findings.push(
        makeFinding(
          rule,
          match[0],
          startIndex,
          startIndex + match[0].length,
        ),
      )
    }
  }

  return findings
}

function checkRequiredPhrase(rule, sentence) {
  if (!rule.values?.length) {
    return []
  }

  if (rule.trigger) {
    let trigger
    try {
      trigger = new RegExp(rule.trigger, 'i')
    } catch (error) {
      throw new Error(`Rule ${rule.code} has an invalid trigger regex.`, {
        cause: error,
      })
    }

    if (!trigger.test(sentence.text)) {
      return []
    }
  }

  const lowerSentence = sentence.text.toLocaleLowerCase()
  const hasRequiredPhrase = rule.values.some((value) =>
    lowerSentence.includes(value.toLocaleLowerCase()),
  )

  return hasRequiredPhrase
    ? []
    : [
        makeFinding(
          rule,
          sentence.text,
          sentence.start,
          sentence.end,
        ),
      ]
}

function checkPattern(rule, sentence) {
  if (!rule.pattern) {
    return []
  }

  let expression
  try {
    expression = new RegExp(rule.pattern, 'gu')
  } catch (error) {
    throw new Error(`Rule ${rule.code} has an invalid regex pattern.`, {
      cause: error,
    })
  }

  const findings = []
  let match = expression.exec(sentence.text)

  while (match) {
    const startIndex = sentence.start + match.index
    findings.push(
      makeFinding(
        rule,
        match[0],
        startIndex,
        startIndex + match[0].length,
      ),
    )

    if (match[0].length === 0) {
      expression.lastIndex += 1
    }
    match = expression.exec(sentence.text)
  }

  return findings
}

export default function ruleChecker(sentences, rules, brandName) {
  const findings = []

  for (const sentence of sentences) {
    for (const rule of rules) {
      if (!rule.active) {
        continue
      }

      if (rule.type === 'banned_term') {
        findings.push(...findBannedTerms(rule, sentence, brandName))
      } else if (rule.type === 'required_phrase') {
        findings.push(...checkRequiredPhrase(rule, sentence))
      } else if (rule.type === 'regex_pattern') {
        findings.push(...checkPattern(rule, sentence))
      }
    }
  }

  return findings
}
