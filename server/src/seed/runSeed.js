import 'dotenv/config'
import mongoose from 'mongoose'
import { seed } from './seed.js'

if (!process.argv.includes('--confirm')) {
  console.error(
    'Seed cancelled. Re-run with `npm run seed -- --confirm` to add any missing sample Rules, Facts, and demo users. Existing records and demo passwords are preserved.',
  )
  process.exitCode = 1
} else {
  seed()
    .catch((error) => {
      console.error('Failed to seed database:', error)
      process.exitCode = 1
    })
    .finally(async () => {
      await mongoose.disconnect()
    })
}
