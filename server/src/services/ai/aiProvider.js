import { GoogleGenAI } from '@google/genai'

const DEFAULT_MODEL = 'gemini-3.8-flash'

export async function analyze(prompt, { signal } = {}) {
  const apiKey = process.env.AI_API_KEY?.trim()
  if (!apiKey) throw new Error('AI_API_KEY is not configured.')

  const model = process.env.AI_MODEL?.trim() || DEFAULT_MODEL
  const client = new GoogleGenAI({ apiKey })
  const response = await client.models.generateContent({
    model,
    contents: prompt,
    config: {
      responseMimeType: 'application/json',
      maxOutputTokens: 4096,
      abortSignal: signal,
      httpOptions: {
        // Keep the SDK deadline above Gemini's 10-second minimum; the analyzer
        // applies the shorter user-facing timeout and falls back when it expires.
        timeout: 20_000,
        retryOptions: { attempts: 1 },
      },
    },
  })

  if (typeof response.text !== 'string' || !response.text.trim()) {
    throw new Error('Gemini returned an empty response.')
  }

  return response.text
}

export default { analyze }
