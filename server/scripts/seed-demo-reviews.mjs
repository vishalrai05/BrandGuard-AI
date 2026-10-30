const [argumentApi, argumentEmail, argumentPassword] = process.argv.slice(2)
const api = (argumentApi || process.env.BRANDGUARD_API || '').replace(/\/+$/, '')
const email = argumentEmail || process.env.BRANDGUARD_EMAIL
const password = argumentPassword || process.env.BRANDGUARD_PASSWORD

if (!api || !email || !password) {
  console.error('Usage: node scripts/seed-demo-reviews.mjs <api-url> <email> <password> (or set BRANDGUARD_API, BRANDGUARD_EMAIL, BRANDGUARD_PASSWORD).')
  process.exitCode = 1
} else {
  async function postJson(path, body, token) {
    const response = await fetch(`${api}${path}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      body: JSON.stringify(body),
    })
    if (!response.ok) throw new Error(`API request failed with HTTP ${response.status}.`)
    return response.json()
  }

  const demoCopy = [
    'NimbusNotes is the best place for every project. Our team will leverage this best-in-class workspace because it makes work easier for everyone who needs one shared place to collect notes and move projects forward.',
    'The report was written by our team and the customer guide was reviewed yesterday. Click here to read more about the way the workspace supports shared notes.',
    'Nimbus Notes guarantees results for every team. Please click here to get started with our synergy-driven workflow.',
    'Our best-in-class tools help teams leverage simple notes. NimbusNotes keeps every important idea in one place.',
    'The launch announcement was prepared by the team and the product guide was approved before the campaign was scheduled for publication.',
    'Learn more about our bleeding-edge workspace. Nimbus Notes is the best way to keep work organized, and everyone can use it to collaborate.',
  ]

  try {
    const login = await postJson('/api/auth/login', { email, password })
    if (typeof login.token !== 'string' || !login.token) throw new Error('Login did not return an access token.')
    for (const inputText of demoCopy) {
      await postJson('/api/reviews', {
        inputText,
        brandName: 'Nimbus Notes',
        useAI: false,
        qualityChecks: true,
      }, login.token)
    }
    console.log(`Created ${demoCopy.length} demo reviews.`)
  } catch (error) {
    console.error(`Demo review seeding failed: ${error.message}`)
    process.exitCode = 1
  }
}
