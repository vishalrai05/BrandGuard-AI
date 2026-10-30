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
  let tokenStart = periodIndex - 1
  const lowerBound = Math.max(0, periodIndex - 32)
  while (tokenStart >= lowerBound && /[A-Za-z.]/.test(text[tokenStart])) tokenStart -= 1
  const token = text.slice(tokenStart + 1, periodIndex)

  if (!token) {
    return false
  }

  const normalized = token.replace(/\.$/, '').toLowerCase()
  let nextIndex = periodIndex + 1
  while (nextIndex < text.length && /\s/.test(text[nextIndex])) nextIndex += 1
  const nextCharacter = text[nextIndex]

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
  let contentStart = 0
  while (contentStart < text.length && /\s/.test(text[contentStart])) contentStart += 1

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

    const start = contentStart
    let sentenceEnd = end
    while (sentenceEnd > start && /\s/.test(text[sentenceEnd - 1])) sentenceEnd -= 1
    const sentenceText = text.slice(start, sentenceEnd)

    if (sentenceText) {
      sentences.push({ text: sentenceText, start, end: start + sentenceText.length })
    }

    contentStart = end
    while (contentStart < text.length && /\s/.test(text[contentStart])) contentStart += 1
    index = end - 1
  }

  const start = contentStart
  let sentenceEnd = text.length
  while (sentenceEnd > start && /\s/.test(text[sentenceEnd - 1])) sentenceEnd -= 1
  const sentenceText = text.slice(start, sentenceEnd)

  if (sentenceText) {
    sentences.push({ text: sentenceText, start, end: start + sentenceText.length })
  }

  return sentences
}
