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
        // Gemini rejects request deadlines shorter than 10 seconds. The analyzer
        // still aborts locally after 8 seconds and falls back to deterministic results.
        timeout: 10_000,
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
