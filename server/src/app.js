import cors from 'cors'
import express from 'express'
import factsRouter from './routes/facts.js'
import healthRouter from './routes/health.js'
import reviewsRouter from './routes/reviews.js'
import rulesRouter from './routes/rules.js'

const allowedOrigins = (process.env.CLIENT_URL ?? '')
  .split(',')
  .map((origin) => origin.trim())
  .filter(Boolean)

if (allowedOrigins.length === 0) {
  throw new Error('CLIENT_URL is not set. Provide at least one allowed origin.')
}

const app = express()
app.set('trust proxy', 1)

app.use(
  cors({
    origin: (origin, callback) =>
      callback(null, !origin || allowedOrigins.includes(origin)),
    methods: ['GET', 'POST', 'PATCH', 'OPTIONS'],
  }),
)
app.use(express.json())
app.use('/api/health', healthRouter)
app.use('/api/rules', rulesRouter)
app.use('/api/facts', factsRouter)
app.use('/api/reviews', reviewsRouter)

app.use((_req, res) => {
  res.status(404).json({ error: 'Route not found.' })
})

app.use((error, _req, res, _next) => {
  console.error('API request failed:', error)
  const status = error.status === 400 ? 400 : 500
  res.status(status).json({
    error: status === 400 ? 'Invalid request.' : 'Internal server error.',
  })
})

export default app
