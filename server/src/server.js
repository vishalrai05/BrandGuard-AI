import 'dotenv/config'
import { connectDB } from './config/db.js'

async function startServer() {
  if (!process.env.MONGODB_URI?.trim()) {
    throw new Error('MONGODB_URI is not set. Configure it in the deployment environment or server/.env.')
  }

  const port = Number(process.env.PORT || 5000)

  if (!Number.isInteger(port) || port < 1 || port > 65535) {
    throw new Error('PORT must be an integer between 1 and 65535.')
  }

  await connectDB()
  const { default: app } = await import('./app.js')

  await new Promise((resolve, reject) => {
    const server = app.listen(port, '0.0.0.0')
    server.once('listening', () => {
      console.log(`Server listening on 0.0.0.0:${port}.`)
      resolve()
    })
    server.once('error', reject)
  })
}

startServer().catch((error) => {
  console.error('Failed to start server:', error)
  process.exitCode = 1
})
