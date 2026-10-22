const abbreviations = new Set([
  'approx',
  'dept',
  'dr',
  'e.g',
  'etc',
  'fig',
  'i.e',
  'inc',
  'jr',
  'mr',
  'mrs',
  'ms',
  'no',
  'prof',
  'sr',
  'vs',
])

function isAbbreviation(text, periodIndex) {
  const token = text.slice(0, periodIndex).match(/(?:[A-Za-z]\.)*[A-Za-z]+$/)?.[0]

  if (!token) {
    return false
  }

  const normalized = token.replace(/\.$/, '').toLowerCase()
  const nextText = text.slice(periodIndex + 1).match(/^\s+(\S)/)
  const nextCharacter = nextText?.[1]

  if (token.length === 1 && nextCharacter && /[A-Z]/.test(nextCharacter)) {
    return true
  }

  if (abbreviations.has(normalized)) {
    if (['dr', 'mr', 'mrs', 'ms', 'prof', 'sr', 'jr'].includes(normalized)) {
      return true
    }

    return !(nextCharacter && /[A-Z]/.test(nextCharacter))
  }

  if (/^(?:[A-Za-z]\.)+[A-Za-z]?$/.test(token)) {
    return !(nextCharacter && /[A-Z]/.test(nextCharacter))
  }

  return false
}

export default function splitSentences(text) {
  const sentences = []
  let sentenceStart = 0

  for (let index = 0; index < text.length; index += 1) {
    const character = text[index]

    if (!'.!?'.includes(character)) {
      continue
    }

    if (
      character === '.' &&
      /\d/.test(text[index - 1] ?? '') &&
      /\d/.test(text[index + 1] ?? '')
    ) {
      continue
    }

    if (character === '.' && isAbbreviation(text, index)) {
      continue
    }

    let end = index + 1
    while (end < text.length && '.!?'.includes(text[end])) {
      end += 1
    }

    if (end < text.length && !/\s/.test(text[end])) {
      continue
    }

    const leadingWhitespace = text.slice(sentenceStart, index + 1).match(/^\s*/)?.[0].length ?? 0
    const start = sentenceStart + leadingWhitespace
    const sentenceText = text.slice(start, end).trimEnd()

    if (sentenceText) {
      sentences.push({ text: sentenceText, start, end: start + sentenceText.length })
    }

    sentenceStart = end
    index = end - 1
  }

  const remaining = text.slice(sentenceStart)
  const leadingWhitespace = remaining.match(/^\s*/)?.[0].length ?? 0
  const start = sentenceStart + leadingWhitespace
  const sentenceText = remaining.trim()

  if (sentenceText) {
    sentences.push({ text: sentenceText, start, end: start + sentenceText.length })
  }

  return sentences
}
