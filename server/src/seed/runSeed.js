import 'dotenv/config'
import mongoose from 'mongoose'
import { seed } from './seed.js'

if (!process.argv.includes('--confirm')) {
  console.error(
    'Seed cancelled: this clears and replaces the Rules and Facts collections. Re-run with `npm run seed -- --confirm` to continue.',
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
